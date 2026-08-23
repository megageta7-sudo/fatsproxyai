import { json, optionsResponse, readJson, requireAdmin, vercelHandler } from "../../src/http.mjs";
import { callGroq, callGemini, callMistral, callNvidia, callXKiro } from "../../src/providers.mjs";
import { loadConfig } from "../../src/store.mjs";
import { maskKey } from "../../src/crypto.mjs";

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  
  try {
    requireAdmin(event);
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
    }

    const { provider, keys, model } = readJson(event);
    if (!provider || !Array.isArray(keys)) {
      return json(400, { ok: false, message: "Provider and keys array are required" });
    }

    const config = await loadConfig();
    const currentKeys = config[provider]?.keys || [];

    const testPrompt = "Reply with exactly one word: 'OK'";
    const results = await Promise.all(keys.map(async (frontendKey) => {
      let keyToTest = frontendKey;
      
      // If key is masked, try to restore its original value from DB
      if (frontendKey.includes("...")) {
        const original = currentKeys.find(k => maskKey(k) === frontendKey);
        if (original) {
          keyToTest = original;
        } else {
          return { key: frontendKey, status: "skipped", message: "Cannot resolve masked key" };
        }
      }

      try {
        let caller;
        let defaultModel;

        if (provider === "groq") {
          caller = callGroq;
          defaultModel = "qwen/qwen3.6-27b";
        } else if (provider === "gemini") {
          caller = callGemini;
          defaultModel = "gemini-2.5-flash";
        } else if (provider === "mistral") {
          caller = callMistral;
          defaultModel = "pixtral-12b-2409";
        } else if (provider === "nvidia") {
          caller = callNvidia;
          defaultModel = "mistralai/mistral-large-3-675b-instruct-2512";
        } else if (provider === "xkiro") {
          caller = callXKiro;
          defaultModel = "mistralai/ministral-14b";
        }

        await caller({ key: keyToTest, model: model || defaultModel, prompt: testPrompt });
        return { key: frontendKey, status: "valid" };
      } catch (err) {
        return { key: frontendKey, status: "invalid", message: err.message };
      }
    }));

    return json(200, { ok: true, results });
  } catch (error) {
    return json(error.statusCode || 500, {
      ok: false,
      error: { code: "TEST_KEYS_ERROR", message: error.message }
    });
  }
}

export default vercelHandler(handler);
