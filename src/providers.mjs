
const PROVIDER_TIMEOUT = Number(process.env.PROVIDER_TIMEOUT || 20000); // 20s default

export function extractRetryAfter(response) {
  if (!response?.headers) return null;
  const header = response.headers.get ? response.headers.get("retry-after") : response.headers["retry-after"];
  if (!header) return null;
  const seconds = Number(header);
  if (!isNaN(seconds) && seconds > 0) return seconds;
  const dateParsed = Date.parse(header);
  if (!isNaN(dateParsed)) {
    return Math.max(1, Math.round((dateParsed - Date.now()) / 1000));
  }
  return null;
}

export function handleProviderError(response, payload, providerName) {
  const rawMessage = payload?.error?.message || payload?.message || `Status ${response.status}`;
  console.error(`[${providerName}] Error: ${rawMessage}`);
  const error = new Error(`${providerName} provider error: ${response.status} - ${rawMessage}`);
  error.statusCode = response.status;
  
  const status = Number(response.status || 0);
  const msg = (typeof rawMessage === "string" ? rawMessage : "").toLowerCase();
  const errCode = (payload?.error?.code || payload?.code || "").toString().toLowerCase();
  const errType = (payload?.error?.type || payload?.type || "").toString().toLowerCase();

  // 1. Check for Model Not Found / Invalid Model
  if (
    errCode === "model_not_found" ||
    errType === "invalid_model" ||
    msg.includes("model_not_found") ||
    msg.includes("invalid model") ||
    msg.includes("model not found") ||
    (status === 404 && (msg.includes("model") || msg.includes("not found") || msg.includes("does not exist") || payload?.status === "NOT_FOUND")) ||
    (status === 400 && msg.includes("model") && (msg.includes("not exist") || msg.includes("not found") || msg.includes("invalid") || msg.includes("not supported")))
  ) {
    error.errorCode = "MODEL_NOT_FOUND";
  }
  // 2. Check for Auth / Key Failure (401, 403, or Gemini 400 invalid/leaked key)
  else if (
    status === 401 ||
    (status === 403 && (msg.includes("leaked") || msg.includes("api key") || msg.includes("permission") || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("invalid"))) ||
    (status === 400 && (msg.includes("api key not valid") || msg.includes("reported as leaked") || msg.includes("invalid api key") || msg.includes("api_key_invalid") || msg.includes("pass a valid api key")))
  ) {
    error.errorCode = "AUTH_FAILED";
  }
  // 3. Check for Rate Limit / Quota Exceeded
  else if (
    status === 429 ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota exceeded") ||
    msg.includes("rate limit")
  ) {
    error.errorCode = "RATE_LIMITED";
  }
  // 4. Default to HTTP_{status}
  else {
    error.errorCode = `HTTP_${status}`;
  }

  error.retryAfterSeconds = extractRetryAfter(response);
  return error;
}

async function fetchWithTimeout(url, options, timeoutMs = PROVIDER_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error(`Provider timeout after ${timeoutMs}ms`);
      error.statusCode = null; // Reviewer point 9: do not fake 408
      error.errorCode = "UPSTREAM_TIMEOUT";
      error.isTimeout = true;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function callGroq({ key, model, image, prompt, system, temperature, history }) {
  const content = [{ type: "text", text: prompt }];
  if (image) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${image.base64}` }
    });
  }
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: temperature ?? 0.2,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...(history || []).map(msg => ({ 
          role: msg.role === "assistant" ? "assistant" : "user", 
          content: msg.text 
        })),
        {
          role: "user",
          content
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw handleProviderError(response, payload, "Groq");
  }

  const text = payload?.choices?.[0]?.message?.content || "";
  return {
    result: text.trim(),
    usage: payload?.usage || null
  };
}


export async function callGemini({ key, model, image, prompt, system, temperature, history }) {
  const parts = [{ text: prompt }];
  if (image) {
    parts.push({
      inlineData: {
        mimeType: image.mime,
        data: image.base64
      }
    });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        temperature: temperature ?? 0.2
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
      ],
      contents: [
        ...(history || []).map(msg => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.text }]
        })),
        {
          role: "user",
          parts
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw handleProviderError(response, payload, "Gemini");
  }

  const candidate = payload?.candidates?.[0];
  if (!candidate && payload?.promptFeedback?.blockReason) {
    const error = new Error(`Gemini blocked prompt: ${payload.promptFeedback.blockReason}`);
    error.statusCode = 400;
    error.isSafetyBlock = true;
    throw error;
  }

  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "OTHER") {
    const error = new Error(`Gemini blocked response: ${candidate.finishReason}`);
    error.statusCode = 400;
    error.isSafetyBlock = true;
    throw error;
  }

  const text = candidate?.content?.parts?.map((part) => part.text || "").join("") || "";
  
  if (!text && response.ok) {
     // Check if it's a refusal disguised as a response (model says "I can't help")
     // But for now just handle empty
  }

  return {
    result: text.trim(),
    usage: payload?.usageMetadata || null
  };
}

export async function callMistral({ key, model, image, prompt, system, temperature, history }) {
  const userMessageContent = [];
  if (prompt) {
    userMessageContent.push({ type: "text", text: prompt });
  }
  if (image) {
    userMessageContent.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mime};base64,${image.base64}`
      }
    });
  }

  const response = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: model || "pixtral-12b-2409",
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...(history || []).map(msg => ({ 
          role: msg.role === "assistant" ? "assistant" : "user", 
          content: msg.text 
        })),
        {
          role: "user",
          content: userMessageContent
        }
      ],
      temperature: temperature ?? 0.2
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw handleProviderError(response, payload, "Mistral");
  }

  const text = payload?.choices?.[0]?.message?.content || "";
  return {
    result: text.trim(),
    usage: payload?.usage || null
  };
}

export async function callNvidia({ key, model, image, prompt, system, temperature, history }) {
  const userMessageContent = [];
  if (prompt) {
    userMessageContent.push({ type: "text", text: prompt });
  }
  if (image) {
    userMessageContent.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mime};base64,${image.base64}`
      }
    });
  }

  const response = await fetchWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: model || "mistralai/mistral-large-3-675b-instruct-2512",
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...(history || []).map(msg => ({ 
          role: msg.role === "assistant" ? "assistant" : "user", 
          content: msg.text 
        })),
        {
          role: "user",
          content: userMessageContent
        }
      ],
      temperature: temperature ?? 0.15,
      max_tokens: 2048,
      top_p: 1.00
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw handleProviderError(response, payload, "Nvidia");
  }

  const text = payload?.choices?.[0]?.message?.content || "";
  return {
    result: text.trim(),
    usage: payload?.usage || null
  };
}

export async function callXKiro({ key, model, image, prompt, system, temperature, history }) {
  const userMessageContent = [];
  if (prompt) {
    userMessageContent.push({ type: "text", text: prompt });
  }
  if (image) {
    userMessageContent.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mime};base64,${image.base64}`
      }
    });
  }

  const response = await fetchWithTimeout("https://api.xkiro.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: model || "mistralai/ministral-14b",
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...(history || []).map(msg => ({ 
          role: msg.role === "assistant" ? "assistant" : "user", 
          content: msg.text 
        })),
        {
          role: "user",
          content: userMessageContent
        }
      ],
      temperature: temperature ?? 0.2
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw handleProviderError(response, payload, "xKiro");
  }

  const text = payload?.choices?.[0]?.message?.content || "";
  return {
    result: text.trim(),
    usage: payload?.usage || null
  };
}

