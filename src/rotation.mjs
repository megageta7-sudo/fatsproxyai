import { updateProviderCursor } from "./store.mjs";
import { callGemini, callGroq, callMistral, callNvidia, callXKiro } from "./providers.mjs";
import redis, { KEYS } from "./redis.mjs";
import { sha256, maskKey } from "./crypto.mjs";
import { recordKeyOperationalMetric, backgroundTask } from "./telemetry.mjs";

const callers = {
  groq: callGroq,
  gemini: callGemini,
  mistral: callMistral,
  nvidia: callNvidia,
  xkiro: callXKiro
};

const MAX_CONCURRENT_PER_KEY = Number(process.env.MAX_CONCURRENT_PER_KEY || 2);
const HEALTH_BAN_DURATION = 300; // 5 minutes in seconds
const INVALID_KEY_BAN = 3600; // 1 hour for revoked/invalid keys

// In-memory circuit breaker fallback (when Redis is down)
const localHealthMap = new Map();

function isKeyHealthyLocal(healthKey) {
  const expiry = localHealthMap.get(healthKey);
  if (!expiry) return true;
  if (Date.now() > expiry) {
    localHealthMap.delete(healthKey);
    return true;
  }
  return false;
}

function markKeyUnhealthyLocal(healthKey, durationSeconds) {
  localHealthMap.set(healthKey, Date.now() + (durationSeconds * 1000));
}

/**
 * Determines retry strategy for failed provider calls.
 * - "next_key": Try next key in same provider (rate limit, server error, safety block)
 * - "skip_provider": Skip to next provider entirely (auth failure — key invalid)
 * - "abort": Stop trying (unknown/client error)
 */
function getRetryStrategy(error) {
  if (error.isSafetyBlock) return "next_key";
  if (error.errorCode === "MODEL_NOT_FOUND") return "skip_provider";
  const status = Number(error.statusCode || 0);
  if (status === 401 || status === 403 || error.errorCode === "AUTH_FAILED") return "skip_provider";
  if (status === 0 || status === 408 || status === 409 || status === 429 || status >= 500 || error.isTimeout) return "next_key";
  return "abort";
}

function normalizeKeyItem(item, provider) {
  if (typeof item === "string") {
    const raw = item.trim();
    const hash = sha256(raw);
    return {
      id: `${provider}_${hash.slice(0, 12)}`,
      key: raw,
      preview: maskKey(raw),
      hash,
      active: true
    };
  }
  const raw = (item.key || item.raw || "").trim();
  const hash = item.hash || (raw ? sha256(raw) : sha256(item.id || Math.random().toString()));
  return {
    id: item.id || `${provider}_${hash.slice(0, 12)}`,
    key: raw,
    preview: item.preview || maskKey(raw),
    hash,
    active: item.active !== false
  };
}

export async function generateWithRotation(config, request) {
  const isDiagnostic = Boolean(request.isDiagnostic);
  const providers = request.forceProvider 
    ? [request.forceProvider] 
    : (request.providerOrder || (Array.isArray(config.providerOrder) && config.providerOrder.length > 0
      ? config.providerOrder
      : ["groq", "gemini"]));
  
  const errors = [];
  const recordedAttempts = [];

  for (const provider of providers) {
    const providerConfig = config[provider];
    const caller = callers[provider];
    if (!providerConfig || !caller || !providerConfig.keys?.length) continue;

    const normalizedKeys = providerConfig.keys
      .map(k => normalizeKeyItem(k, provider))
      .filter(k => k.active && k.key);

    if (normalizedKeys.length === 0) continue;

    const attemptsCount = normalizedKeys.length;

    // Use Redis for atomic cursor if available
    let currentIndex = Number(providerConfig.cursor || 0);
    let redisCursor = 0;
    if (redis) {
      try {
        redisCursor = await redis.incr(KEYS.cursor(provider));
        currentIndex = redisCursor % normalizedKeys.length;
      } catch (e) {
        console.warn("[Proxy] Redis cursor failed, fallback to memory:", e.message);
      }
    }

    // Batch prefetch health status for all keys at once
    const healthStatuses = {};
    if (redis) {
      try {
        const healthKeys = normalizedKeys.map(k => `health:${provider}:${k.id}`);
        const results = await Promise.all(healthKeys.map(k => redis.get(k)));
        healthKeys.forEach((k, i) => { healthStatuses[k] = results[i]; });
      } catch (e) {
        console.warn("[Proxy] Batch health prefetch failed:", e.message);
      }
    }

    for (let attempt = 0; attempt < attemptsCount; attempt += 1) {
      const index = (currentIndex + attempt) % normalizedKeys.length;
      const keyObj = normalizedKeys[index];
      const rawKey = keyObj.key;
      const keyId = keyObj.id;
      const keyHash = keyObj.hash;
      const keyPreview = keyObj.preview;

      const activeKey = `active:${provider}:${keyId}`;
      const healthKey = `health:${provider}:${keyId}`;

      // 1. Check Health (use prefetched data or fallback)
      if (redis) {
        try {
          const isBanned = healthStatuses[healthKey] ?? await redis.get(healthKey);
          if (isBanned && !isDiagnostic) {
            console.log(`[Proxy] Skipping unhealthy key for ${provider} (${keyId}): ${isBanned}`);
            continue;
          }
        } catch (redisErr) {
          console.warn(`[Proxy] Redis health check failed, using local fallback:`, redisErr.message);
          if (!isKeyHealthyLocal(healthKey) && !isDiagnostic) {
            console.log(`[Proxy] Skipping unhealthy key (local) for ${provider} (${keyId})`);
            continue;
          }
        }
      } else if (!isKeyHealthyLocal(healthKey) && !isDiagnostic) {
        console.log(`[Proxy] Skipping unhealthy key (no-redis) for ${provider} (${keyId})`);
        continue;
      }

      // 2. Atomic Concurrency: INCR first, check after (prevents race condition)
      if (redis && !isDiagnostic) {
        try {
          const newCount = await redis.incr(activeKey);
          redis.expire(activeKey, 30).catch(() => {}); // Safety TTL for crash recovery
          if (newCount > MAX_CONCURRENT_PER_KEY) {
            await redis.decr(activeKey); // Rollback
            console.log(`[Proxy] Key at capacity for ${provider} (${keyId}): ${newCount}/${MAX_CONCURRENT_PER_KEY}`);
            continue;
          }
        } catch (redisErr) {
          console.warn(`[Proxy] Redis concurrency check failed:`, redisErr.message);
        }
      }

      // Update local memory & Firestore
      const nextIdx = (index + 1) % normalizedKeys.length;
      providerConfig.cursor = nextIdx;
      if (!redis || redisCursor % 50 === 0) {
        updateProviderCursor(provider, nextIdx).catch(() => {});
      }

      const attemptStart = Date.now();
      const currentModel = request.forceModel || request.model || providerConfig.model;

      try {
        const output = await caller({
          key: rawKey,
          model: currentModel,
          image: request.image,
          prompt: request.prompt,
          system: request.system,
          temperature: request.temperature,
          history: request.history
        });

        const latencyMs = Date.now() - attemptStart;

        // Release concurrency counter
        if (redis && !isDiagnostic) redis.decr(activeKey).catch(() => {});

        recordedAttempts.push({
          provider,
          model: currentModel,
          keyId,
          keyPreview,
          keyHash,
          statusCode: 200,
          latencyMs,
          isSuccess: true
        });

        // Record operational metric in background (non-blocking)
        backgroundTask(recordKeyOperationalMetric({
          provider,
          keyId,
          keyHash,
          keyPreview,
          statusCode: 200,
          latencyMs,
          isSuccess: true,
          isDiagnostic
        }));

        return {
          output: {
            provider,
            model: providerConfig.model,
            keyId,
            keyPreview,
            attempts: recordedAttempts,
            ...output
          }
        };
      } catch (error) {
        const latencyMs = Date.now() - attemptStart;

        // Release concurrency counter
        if (redis && !isDiagnostic) redis.decr(activeKey).catch(() => {});

        const status = error.statusCode || null;
        const errCode = error.errorCode || (error.isTimeout ? "UPSTREAM_TIMEOUT" : (status ? `HTTP_${status}` : "ERROR"));

        recordedAttempts.push({
          provider,
          model: currentModel,
          keyId,
          keyPreview,
          keyHash,
          statusCode: status,
          errorCode: errCode,
          latencyMs,
          errorMessage: error.message,
          isSuccess: false
        });

        console.warn(`[Proxy] Provider ${provider} (${providerConfig.model}) failed: ${error.message} (Status: ${status})`);
        errors.push({
          provider,
          model: providerConfig.model,
          keyId,
          message: error.message,
          statusCode: status
        });

        // Record operational metric & circuit breaker in background
        backgroundTask(recordKeyOperationalMetric({
          provider,
          keyId,
          keyHash,
          keyPreview,
          statusCode: status,
          errorCode: errCode,
          latencyMs,
          errorMessage: error.message,
          isSuccess: false,
          retryAfterSeconds: error.retryAfterSeconds,
          isDiagnostic
        }));

        // Local circuit breaker fallback (skip if model error since key is healthy)
        if (error.errorCode !== "MODEL_NOT_FOUND") {
          if (status === 401 || status === 403 || error.errorCode === "AUTH_FAILED") {
            markKeyUnhealthyLocal(healthKey, INVALID_KEY_BAN);
          } else if (status === 429 || status >= 500) {
            markKeyUnhealthyLocal(healthKey, error.retryAfterSeconds || HEALTH_BAN_DURATION);
          }
        }

        const strategy = getRetryStrategy(error);
        if (strategy === "skip_provider") {
          console.log(`[Proxy] Skipping provider ${provider} entirely (${error.errorCode || 'strategy: skip_provider'})`);
          break;
        }
        if (strategy === "abort") break;
        console.log(`[Proxy] Rotating to next key for ${provider}...`);
      }
    }
  }

  const error = new Error("No provider key succeeded or all keys at capacity");
  error.statusCode = 502;
  error.details = errors;
  error.attempts = recordedAttempts;
  throw error;
}
