import { json, optionsResponse, readJson, requireAdmin, vercelHandler } from "../../src/http.mjs";
import { maskKey, normalizeKeyList } from "../../src/crypto.mjs";
import { loadConfig, saveConfig } from "../../src/store.mjs";

export function publicConfig(config) {
  return {
    updatedAt: config.updatedAt,
    providerOrder: config.providerOrder,
    groq: {
      model: config.groq.model,
      keyCount: config.groq.keys.length,
      keys: config.groq.keys.map(maskKey)
    },
    gemini: {
      model: config.gemini.model,
      keyCount: config.gemini.keys.length,
      keys: config.gemini.keys.map(maskKey)
    },
    mistral: {
      model: config.mistral?.model || "mistral-tiny",
      keyCount: config.mistral?.keys?.length || 0,
      keys: (config.mistral?.keys || []).map(maskKey)
    },
    nvidia: {
      model: config.nvidia?.model || "mistralai/mistral-large-3-675b-instruct-2512",
      keyCount: config.nvidia?.keys?.length || 0,
      keys: (config.nvidia?.keys || []).map(maskKey)
    },
    xkiro: {
      model: config.xkiro?.model || "google/gemini-2.5-flash",
      keyCount: config.xkiro?.keys?.length || 0,
      keys: (config.xkiro?.keys || []).map(maskKey)
    },
    extensionKeys: (config.extensionKeys || []).map((key) => ({
      id: key.id,
      label: key.label,
      email: key.email,
      active: key.active !== false,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt || null
    }))
  };
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    requireAdmin(event);

    if (event.httpMethod === "GET") {
      const config = await loadConfig();
      return json(200, { ok: true, config: publicConfig(config) });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
    }

    const body = readJson(event);
    const config = await loadConfig();

    const restoreKeys = (input, current) => {
      const inputList = normalizeKeyList(input);
      const restored = inputList.map(key => {
        if (key.includes("...")) {
          const original = current.find(k => maskKey(k) === key);
          return original || key;
        }
        return key;
      });
      // Deduplicate
      return [...new Set(restored)];
    };

    const next = {
      ...config,
      providerOrder: Array.isArray(body.providerOrder) && body.providerOrder.length
        ? body.providerOrder.filter((name) => ["groq", "gemini", "mistral", "nvidia", "xkiro"].includes(name))
        : config.providerOrder,
      groq: {
        ...config.groq,
        model: body.groq?.model || config.groq.model,
        keys: body.groq?.keys === undefined ? config.groq.keys : restoreKeys(body.groq.keys, config.groq.keys),
        cursor: 0
      },
      gemini: {
        ...config.gemini,
        model: body.gemini?.model || config.gemini.model,
        keys: body.gemini?.keys === undefined ? config.gemini.keys : restoreKeys(body.gemini.keys, config.gemini.keys),
        cursor: 0
      },
      mistral: {
        ...(config.mistral || {}),
        model: body.mistral?.model || config.mistral?.model || "mistral-tiny",
        keys: body.mistral?.keys === undefined ? (config.mistral?.keys || []) : restoreKeys(body.mistral.keys, (config.mistral?.keys || [])),
        cursor: 0
      },
      nvidia: {
        ...(config.nvidia || {}),
        model: body.nvidia?.model || config.nvidia?.model || "mistralai/mistral-large-3-675b-instruct-2512",
        keys: body.nvidia?.keys === undefined ? (config.nvidia?.keys || []) : restoreKeys(body.nvidia.keys, (config.nvidia?.keys || [])),
        cursor: 0
      },
      xkiro: {
        ...(config.xkiro || {}),
        model: body.xkiro?.model || config.xkiro?.model || "google/gemini-2.5-flash",
        keys: body.xkiro?.keys === undefined ? (config.xkiro?.keys || []) : restoreKeys(body.xkiro.keys, (config.xkiro?.keys || [])),
        cursor: 0
      }
    };

    const saved = await saveConfig(next);
    return json(200, { ok: true, config: publicConfig(saved) });
  } catch (error) {
    return json(error.statusCode || 500, {
      ok: false,
      error: {
        code: "ADMIN_CONFIG_ERROR",
        message: error.message
      }
    });
  }
}

export default vercelHandler(handler);
