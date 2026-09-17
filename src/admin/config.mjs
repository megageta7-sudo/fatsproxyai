import { json, optionsResponse, readJson, requireAdmin } from "../http.mjs";
import { maskKey, normalizeKeyList } from "../crypto.mjs";
import { loadConfig, saveConfig } from "../store.mjs";

import { normalizeProviderKeys } from "../store.mjs";

export function publicConfig(config) {
  const formatKeys = (provider) => {
    const norm = normalizeProviderKeys(provider, config[provider]?.keys || []);
    return {
      keyCount: norm.length,
      keys: norm.map(k => k.preview),
      keyItems: norm.map(k => ({
        id: k.id,
        preview: k.preview,
        active: k.active !== false,
        createdAt: k.createdAt || null
      }))
    };
  };

  const groqData = formatKeys("groq");
  const geminiData = formatKeys("gemini");
  const mistralData = formatKeys("mistral");
  const nvidiaData = formatKeys("nvidia");
  const xkiroData = formatKeys("xkiro");

  return {
    updatedAt: config.updatedAt,
    providerOrder: config.providerOrder,
    groq: { model: config.groq?.model, ...groqData },
    gemini: { model: config.gemini?.model, ...geminiData },
    mistral: { model: config.mistral?.model || "mistral-tiny", ...mistralData },
    nvidia: { model: config.nvidia?.model || "mistralai/mistral-large-3-675b-instruct-2512", ...nvidiaData },
    xkiro: { model: config.xkiro?.model || "google/gemini-2.5-flash", ...xkiroData },
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

export async function handler(event) {
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
