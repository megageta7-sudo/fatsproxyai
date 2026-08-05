import { recordLog, loadConfig } from "../src/store.mjs";
import { validateExtensionToken } from "../src/auth.mjs";

/**
 * Multi-function Mistral endpoint:
 *  hahaha
 * MODE 1 (Legacy - Smart Keywords):
 *   Body: { apiKey, model, prompt, image }
 *   → Generates microstock metadata using Mistral
 *
 * MODE 2 (OpenAI-Compatible Proxy - Page Agent):
 *   Body: { model, messages, tools?, tool_choice?, ... }
 *   Header: Authorization: Bearer <MISTRAL_KEY or AGENT_ACCESS_KEY>
 *   → Forwards request as-is to Mistral /chat/completions (OpenAI-compatible)
 *
 * Detection: If body contains `messages` array → Mode 2, otherwise → Mode 1
 */

// Keys allowed to use the agent proxy mode (set in env, comma-separated)
function getAgentAccessKeys() {
  const keys = process.env.AGENT_ACCESS_KEYS || process.env.EXTENSION_KEYS || "";
  return keys.split(",").map(k => k.trim()).filter(Boolean);
}

// Get Mistral API keys from database/env
async function getMistralKey() {
  const config = await loadConfig();
  const keyList = config.mistral?.keys || [];
  if (keyList.length === 0) return null;
  // Simple random rotation
  return keyList[Math.floor(Math.random() * keyList.length)];
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // ─── MODE DETECTION ───
  // If body has `messages` array → OpenAI-compatible proxy mode (Page Agent)
  if (Array.isArray(body.messages)) {
    return handleAgentProxy(req, res, body);
  }

  // Otherwise → Legacy Smart Keywords mode
  return handleLegacyMetadata(req, res, body);
}

// ═══════════════════════════════════════════════════════════════
// MODE 2: OpenAI-Compatible Proxy for Page Agent
// ═══════════════════════════════════════════════════════════════
async function handleAgentProxy(req, res, body) {
  try {
    // Auth: check Bearer token
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Allow either: direct Mistral API key, or an AGENT_ACCESS_KEY
    const agentKeys = getAgentAccessKeys();
    const mistralKeyFromEnv = await getMistralKey();
    let mistralApiKey = null;

    if (bearerToken.startsWith("M") || bearerToken.startsWith("mistral")) {
      // User provided their own Mistral key directly
      mistralApiKey = bearerToken;
    } else {
      // Check if it's in AGENT_ACCESS_KEYS env
      let isValidToken = agentKeys.length > 0 && agentKeys.includes(bearerToken);
      
      // If not in env, check Firestore database (using validateExtensionToken)
      if (!isValidToken && bearerToken) {
        try {
          const validatedKey = await validateExtensionToken(bearerToken);
          if (validatedKey) {
            isValidToken = true;
          }
        } catch (e) {
          console.warn("[Mistral Proxy] DB Token validation failed/expired:", e.message);
        }
      }

      if (isValidToken) {
        mistralApiKey = mistralKeyFromEnv;
        if (!mistralApiKey) {
          return res.status(401).json({
            error: {
              message: "Token Akses DITERIMA, tapi Server Proxy belum dikonfigurasi dengan Kunci Provider Mistral di Admin UI!",
              type: "missing_provider_key"
            }
          });
        }
      } else if (!bearerToken && mistralKeyFromEnv) {
        // No auth provided but server has keys → allow (for testing/demo)
        mistralApiKey = mistralKeyFromEnv;
      } else {
        return res.status(401).json({
          error: {
            message: "Token Akses DITOLAK. Pastikan Bearer token sesuai dengan yang terdaftar di database.",
            type: "invalid_access_token"
          }
        });
      }
    }

    if (!mistralApiKey) {
      return res.status(401).json({
        error: {
          message: "Unauthorized. Provide a Mistral API key or valid access key.",
          type: "auth_error"
        }
      });
    }

    // Forward the entire request body to Mistral's OpenAI-compatible endpoint
    const mistralModel = body.model || process.env.MISTRAL_MODEL || "mistral-large-latest";
    const requestBody = {
      ...body,
      model: mistralModel,
    };

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    // Forward the response status and body as-is (OpenAI-compatible)
    res.status(response.status).json(data);

    // Log (non-blocking)
    recordLog({
      method: "POST",
      path: "/api/mistral",
      status: response.status,
      host: req.headers.host || "unknown",
      provider: "mistral",
      model: mistralModel,
      message: response.ok ? "Agent proxy success" : `Agent proxy error: ${data?.error?.message || 'unknown'}`
    }).catch(() => {});

  } catch (error) {
    console.error('Mistral Agent Proxy Error:', error);
    res.status(500).json({
      error: {
        message: 'Internal Server Error: ' + error.message,
        type: "server_error"
      }
    });
    recordLog({
      method: "POST",
      path: "/api/mistral",
      status: 500,
      host: req.headers?.host || "unknown",
      provider: "mistral",
      message: `Agent proxy error: ${error.message}`,
      error: true
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// MODE 1: Legacy Smart Keywords Metadata Generation
// ═══════════════════════════════════════════════════════════════
async function handleLegacyMetadata(req, res, body) {
  const { apiKey, model, prompt, image } = body;

  if (!apiKey || (!prompt && !image)) {
    return res.status(400).json({ error: 'API Key and either Prompt or Image are required' });
  }

  try {
    const userMessageContent = [];
    if (prompt) {
      userMessageContent.push({ type: 'text', text: prompt });
    }
    if (image) {
      userMessageContent.push({
        type: 'image_url',
        image_url: image // This is the base64 data URL
      });
    }

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'mistral-large-latest',
        messages: [
          {
            role: 'system',
            content: 'You are a microstock metadata expert. Your task is to generate a Title and exactly 50 Keywords for the content provided. \n\nOutput format:\nTitle: [Generated Title, descriptive and catchy, 50-70 characters]\nKeywords: [50 keywords, comma-separated, most relevant first, no duplicates, all lowercase]'
          },
          {
            role: 'user',
            content: userMessageContent
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
    await recordLog({
      method: "POST",
      path: "/api/mistral",
      status: 200,
      host: req.headers.host || "unknown",
      provider: "mistral",
      model: model || "mistral-large-latest",
      message: "Mistral generation success"
    });
  } catch (error) {
    console.error('Mistral API Error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
    await recordLog({
      method: "POST",
      path: "/api/mistral",
      status: 500,
      host: req.headers?.host || "unknown",
      message: error.message,
      error: true
    });
  }
}
