import { json, optionsResponse, readJson, requireAdmin, vercelHandler } from "../../src/http.mjs";
import { maskKey, normalizeKeyList } from "../../src/crypto.mjs";
import { loadConfig, saveConfig } from "../../src/store.mjs";

function mapPublicKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => {
    if (typeof k === "string") {
      return {
        id: `key_${maskKey(k)}`,
        preview: maskKey(k),
        active: true
      };
    }
    return {
      id: k.id,
      preview: k.preview || maskKey(k.key),
      active: k.active !== false,
      createdAt: k.createdAt || null
    };
  });
}

export function publicConfig(config) {
  const getKeys = (provider) => config[provider]?.keys || [];
  return {
    updatedAt: config.updatedAt,
    providerOrder: config.providerOrder,
    groq: {
      model: config.groq.model,
      keyCount: getKeys("groq").length,
      keys: getKeys("groq").map(k => typeof k === 'string' ? maskKey(k) : (k.preview || maskKey(k.key))),
      keyItems: mapPublicKeys(getKeys("groq"))
    },
    gemini: {
      model: config.gemini.model,
      keyCount: getKeys("gemini").length,
      keys: getKeys("gemini").map(k => typeof k === 'string' ? maskKey(k) : (k.preview || maskKey(k.key))),
      keyItems: mapPublicKeys(getKeys("gemini"))
    },
    mistral: {
      model: config.mistral?.model || "mistral-tiny",
      keyCount: getKeys("mistral").length,
      keys: getKeys("mistral").map(k => typeof k === 'string' ? maskKey(k) : (k.preview || maskKey(k.key))),
      keyItems: mapPublicKeys(getKeys("mistral"))
    },
    nvidia: {
      model: config.nvidia?.model || "mistralai/mistral-large-3-675b-instruct-2512",
      keyCount: getKeys("nvidia").length,
      keys: getKeys("nvidia").map(k => typeof k === 'string' ? maskKey(k) : (k.preview || maskKey(k.key))),
      keyItems: mapPublicKeys(getKeys("nvidia"))
    },
    xkiro: {
      model: config.xkiro?.model || "google/gemini-2.5-flash",
      keyCount: getKeys("xkiro").length,
      keys: getKeys("xkiro").map(k => typeof k === 'string' ? maskKey(k) : (k.preview || maskKey(k.key))),
      keyItems: mapPublicKeys(getKeys("xkiro"))
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
