import { json, optionsResponse, readJson, requireAdmin } from "../http.mjs";
import { randomToken, sha256 } from "../crypto.mjs";
import { loadConfig, saveConfig } from "../store.mjs";

function publicKeys(config) {
  return (config.extensionKeys || []).map((key) => ({
    id: key.id,
    label: key.label,
    active: key.active !== false,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt || null
  }));
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    requireAdmin(event);
    const config = await loadConfig();

    if (event.httpMethod === "GET") {
      return json(200, { ok: true, keys: publicKeys(config) });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
    }

    const body = readJson(event);

    if (body.action === "create") {
      const token = randomToken("sk_live");
      const item = {
        id: randomToken("key").slice(0, 18),
        hash: sha256(token),
        label: String(body.label || "Extension key").slice(0, 80),
        email: body.email ? String(body.email).toLowerCase() : null,
        active: true,
        createdAt: new Date().toISOString()
      };
      if (!config.extensionKeys) config.extensionKeys = [];
      config.extensionKeys.push(item);
      const saved = await saveConfig(config);
      return json(200, {
        ok: true,
        token,
        keys: publicKeys(saved)
      });
    }

    if (body.action === "setActive") {
      const id = String(body.id || "");
      const active = Boolean(body.active);
      const key = (config.extensionKeys || []).find((item) => item.id === id);
      if (!key) return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Extension key not found" } });
      key.active = active;
      const saved = await saveConfig(config);
      return json(200, { ok: true, keys: publicKeys(saved) });
    }

    if (body.action === "delete") {
      const id = String(body.id || "");
      config.extensionKeys = (config.extensionKeys || []).filter((item) => item.id !== id);
      const saved = await saveConfig(config);
      return json(200, { ok: true, keys: publicKeys(saved) });
    }

    return json(400, { ok: false, error: { code: "BAD_ACTION", message: "Unknown action" } });
  } catch (error) {
    return json(error.statusCode || 500, {
      ok: false,
      error: {
        code: "ADMIN_KEY_ERROR",
        message: error.message
      }
    });
  }
}
