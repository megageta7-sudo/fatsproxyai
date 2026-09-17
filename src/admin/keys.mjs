import { json, optionsResponse, readJson, requireAdmin } from "../http.mjs";
import { loadConfig, saveConfig, normalizeProviderKeys } from "../store.mjs";
import { sha256, maskKey } from "../crypto.mjs";
import { callGroq, callGemini, callMistral, callNvidia, callXKiro } from "../providers.mjs";
import { recordKeyOperationalMetric } from "../telemetry.mjs";
import redis from "../redis.mjs";

const callers = {
  groq: callGroq,
  gemini: callGemini,
  mistral: callMistral,
  nvidia: callNvidia,
  xkiro: callXKiro
};

const defaultModels = {
  groq: "qwen/qwen3.8-27b",
  gemini: "gemini-1.5-flash",
  mistral: "mistral-small-latest",
  nvidia: "mistralai/mistral-large-3-675b-instruct-2512",
  xkiro: "mistralai/ministral-14b"
};

function sanitizeKeysForResponse(keys) {
  return (keys || []).map(k => ({
    id: k.id,
    preview: k.preview || (k.key ? maskKey(k.key) : "unknown"),
    active: k.active !== false,
    createdAt: k.createdAt || null
  }));
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    requireAdmin(event);

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
    }

    const body = readJson(event);
    const { action, provider, keyId, key: rawKey, active } = body;

    if (!provider || !callers[provider]) {
      return json(400, { ok: false, message: "Valid provider is required" });
    }

    const config = await loadConfig();
    const providerConfig = config[provider] || { keys: [], model: defaultModels[provider] };
    let keys = normalizeProviderKeys(provider, providerConfig.keys || []);

    // ─── ACTION: ADD KEY ───
    if (action === "add") {
      const cleanKey = String(rawKey || "").trim();
      if (!cleanKey) return json(400, { ok: false, message: "Key value is required" });

      const hash = sha256(cleanKey);
      const newKeyId = `${provider}_${hash.slice(0, 12)}`;

      const exists = keys.find(k => k.id === newKeyId || k.key === cleanKey);
      if (exists) {
        return json(400, { ok: false, message: "Key already exists in this provider" });
      }

      keys.push({
        id: newKeyId,
        key: cleanKey,
        preview: maskKey(cleanKey),
        hash,
        active: true,
        createdAt: new Date().toISOString()
      });

      config[provider].keys = keys;
      await saveConfig(config);

      return json(200, {
        ok: true,
        message: "Key added successfully",
        keyId: newKeyId,
        keys: sanitizeKeysForResponse(keys)
      });
    }

    // ─── ACTION: EDIT / UPDATE KEY ───
    if (action === "edit" || action === "update") {
      if (!keyId) return json(400, { ok: false, message: "keyId is required for edit" });
      const cleanKey = String(rawKey || "").trim();
      if (!cleanKey) return json(400, { ok: false, message: "New key value is required" });

      const targetIndex = keys.findIndex(k => k.id === keyId);
      if (targetIndex === -1) {
        return json(404, { ok: false, message: "Key not found" });
      }

      const hash = sha256(cleanKey);
      keys[targetIndex] = {
        ...keys[targetIndex],
        key: cleanKey,
        preview: maskKey(cleanKey),
        hash,
        active: true,
        updatedAt: new Date().toISOString()
      };

      config[provider].keys = keys;
      await saveConfig(config);

      // Reset Redis health state for this key
      if (redis) {
        await Promise.all([
          redis.del(`health:${provider}:${keyId}`),
          redis.del(`cooldown:${provider}:${keyId}`),
          redis.del(`errors_consecutive:${provider}:${keyId}`)
        ]).catch(() => {});
      }

      return json(200, {
        ok: true,
        message: "Key updated successfully",
        keys: sanitizeKeysForResponse(keys)
      });
    }

    // ─── ACTION: DELETE KEY ───
    if (action === "delete") {
      if (!keyId) return json(400, { ok: false, message: "keyId is required for delete" });

      const initialLength = keys.length;
      keys = keys.filter(k => k.id !== keyId);

      if (keys.length === initialLength) {
        return json(404, { ok: false, message: "Key not found" });
      }

      config[provider].keys = keys;
      await saveConfig(config);

      // Clean up Redis keys
      if (redis) {
        await Promise.all([
          redis.del(`health:${provider}:${keyId}`),
          redis.del(`cooldown:${provider}:${keyId}`),
          redis.del(`disabled:${provider}:${keyId}`),
          redis.del(`errors_consecutive:${provider}:${keyId}`)
        ]).catch(() => {});
      }

      return json(200, {
        ok: true,
        message: "Key deleted successfully",
        keys: sanitizeKeysForResponse(keys)
      });
    }

    // ─── ACTION: TOGGLE ACTIVE / DISABLED ───
    if (action === "toggle") {
      if (!keyId) return json(400, { ok: false, message: "keyId is required" });
      const target = keys.find(k => k.id === keyId);
      if (!target) return json(404, { ok: false, message: "Key not found" });

      const newActiveState = typeof active === "boolean" ? active : !target.active;
      target.active = newActiveState;

      config[provider].keys = keys;
      await saveConfig(config);

      // Synchronize to Redis disabled flag
      if (redis) {
        if (!newActiveState) {
          await redis.set(`disabled:${provider}:${keyId}`, "1");
        } else {
          await redis.del(`disabled:${provider}:${keyId}`);
        }
      }

      return json(200, {
        ok: true,
        message: `Key ${newActiveState ? "enabled" : "disabled"} successfully`,
        keys: sanitizeKeysForResponse(keys)
      });
    }

    // ─── ACTION: DIAGNOSTIC LIVE TEST (Reviewer Point 13) ───
    if (action === "test") {
      if (!keyId) return json(400, { ok: false, message: "keyId is required for test" });
      const target = keys.find(k => k.id === keyId);
      if (!target || !target.key) return json(404, { ok: false, message: "Key not found" });

      const caller = callers[provider];
      const testModel = providerConfig.model || defaultModels[provider];
      const start = Date.now();

      try {
        await caller({
          key: target.key,
          model: testModel,
          prompt: "Reply with exactly one word: 'OK'",
          temperature: 0.1
        });
        const latencyMs = Date.now() - start;

        // Write healthy status to Redis so dashboard reflects real state
        recordKeyOperationalMetric({
          provider, keyId, keyPreview: target.preview,
          statusCode: 200, latencyMs, isSuccess: true,
          isDiagnostic: true
        }).catch(() => {});

        return json(200, {
          ok: true,
          status: "valid",
          latencyMs,
          message: `Key is healthy (${latencyMs}ms)`
        });
      } catch (err) {
        const latencyMs = Date.now() - start;
        const errCode = err.errorCode || "TEST_FAILED";
        const status = err.statusCode || null;

        // Write failure status to Redis so dashboard reflects real state
        recordKeyOperationalMetric({
          provider, keyId, keyPreview: target.preview,
          statusCode: status,
          errorCode: errCode,
          errorMessage: err.message,
          latencyMs, isSuccess: false,
          retryAfterSeconds: err.retryAfterSeconds,
          isDiagnostic: true
        }).catch(() => {});

        let diagnosticStatus = "error";
        let diagnosticMessage = err.message;

        if (errCode === "MODEL_NOT_FOUND") {
          diagnosticStatus = "model_error";
          diagnosticMessage = `Key valid & terhubung, tapi model '${testModel}' tidak tersedia di ${provider}. Ubah model di Model Settings.`;
        } else if (errCode === "RATE_LIMITED" || status === 429) {
          diagnosticStatus = "rate_limited";
          diagnosticMessage = `Rate limit tercapai. Cooldown ${err.retryAfterSeconds || 30}s: ${err.message}`;
        } else if (errCode === "AUTH_FAILED" || status === 401 || status === 403) {
          diagnosticStatus = "invalid";
          diagnosticMessage = `API Key tidak valid atau dicabut: ${err.message}`;
        } else if (err.isTimeout || errCode === "UPSTREAM_TIMEOUT") {
          diagnosticStatus = "timeout";
          diagnosticMessage = `Timeout saat menghubungi ${provider} (>20s): ${err.message}`;
        }

        return json(200, {
          ok: false,
          status: diagnosticStatus,
          latencyMs,
          statusCode: status,
          errorCode: errCode,
          message: diagnosticMessage
        });
      }
    }

    return json(400, { ok: false, message: `Unknown action '${action}'` });
  } catch (err) {
    return json(err.statusCode || 500, {
      ok: false,
      error: { code: "KEY_MANAGEMENT_ERROR", message: err.message }
    });
  }
}
