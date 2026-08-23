
const PROVIDER_TIMEOUT = Number(process.env.PROVIDER_TIMEOUT || 10000); // 10s default

async function fetchWithTimeout(url, options, timeoutMs = PROVIDER_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error(`Provider timeout after ${timeoutMs}ms`);
      error.statusCode = 408;
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
    const rawMessage = payload?.error?.message || `Status ${response.status}`;
    console.error(`[Groq] Error: ${rawMessage}`);
    const error = new Error(`Groq provider error: ${response.status}`);
    error.statusCode = response.status;
    throw error;
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
    const rawMessage = payload?.error?.message || `Status ${response.status}`;
    console.error(`[Gemini] Error: ${rawMessage}`);
    const error = new Error(`Gemini provider error: ${response.status}`);
    error.statusCode = response.status;
    throw error;
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
      model: model || "mistral-tiny",
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
    const rawMessage = payload?.error?.message || `Status ${response.status}`;
    console.error(`[Mistral] Error: ${rawMessage}`);
    const error = new Error(`Mistral provider error: ${response.status}`);
    error.statusCode = response.status;
    throw error;
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
    const rawMessage = payload?.error?.message || `Status ${response.status}`;
    console.error(`[Nvidia] Error: ${rawMessage}`);
    const error = new Error(`Nvidia provider error: ${response.status}`);
    error.statusCode = response.status;
    throw error;
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
      model: model || "google/gemini-2.5-flash",
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
    const rawMessage = payload?.error?.message || `Status ${response.status}`;
    console.error(`[xKiro] Error: ${rawMessage}`);
    const error = new Error(`xKiro provider error: ${response.status} - ${rawMessage}`);
    error.statusCode = response.status;
    throw error;
  }

  const text = payload?.choices?.[0]?.message?.content || "";
  return {
    result: text.trim(),
    usage: payload?.usage || null
  };
}

