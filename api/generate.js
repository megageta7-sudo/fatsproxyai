import { bearerToken, json, optionsResponse, readJson, vercelHandler } from "../src/http.mjs";
import { sha256 } from "../src/crypto.mjs";
import { validateExtensionToken } from "../src/auth.mjs";
import { loadConfig, updateKeyLastUsed, trackUsage } from "../src/store.mjs";
import { generateWithRotation } from "../src/rotation.mjs";
import { normalizeMetadata } from "../src/normalize.mjs";
import { recordApiTelemetry, backgroundTask } from "../src/telemetry.mjs";

const MAX_BASE64_LENGTH = Number(process.env.MAX_BASE64_LENGTH || 6_000_000);

function validateRequest(body) {
  if (!body || typeof body !== "object") throw new Error("JSON body is required");
  
  // Validate settings
  if (body.settings && typeof body.settings !== "object") {
    throw new Error("settings must be an object");
  }

  // Validate context
  if (body.context && typeof body.context !== "string") {
    throw new Error("context must be a string");
  }

  if (body.image) {
    if (!body.image.base64 || !body.image.mime) throw new Error("image.base64 and image.mime are required");
    if (!/^image\/(png|jpe?g|webp)$/i.test(body.image.mime)) throw new Error("Only png, jpeg, and webp images are supported");
    if (body.image.base64.length > MAX_BASE64_LENGTH) throw new Error("Image payload is too large");
  }
}

async function handler(event, executionContext) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  const requestStart = Date.now();
  const requestId = event.requestId;
  const clientIp = event.headers?.["x-forwarded-for"] || "unknown";

  try {
    const token = bearerToken(event);
    const body = readJson(event);

    // Parallel: validate token & load config simultaneously
    const [keyRecord, config] = await Promise.all([
      validateExtensionToken(token),
      loadConfig()
    ]);
    if (!keyRecord) {
      // Telemetry auth failure (non-blocking)
      backgroundTask(recordApiTelemetry({
        requestId,
        endpoint: "/api/generate",
        method: "POST",
        statusCode: 401,
        totalLatencyMs: Date.now() - requestStart,
        clientIp,
        errorCode: "UNAUTHORIZED",
        errorMessage: "Invalid extension API key"
      }), executionContext);

      return json(401, { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid extension API key" } });
    }
    
    // Require prompt from client
    const prompt = body.prompt;
    if (!prompt || typeof prompt !== "string") {
      return json(400, { ok: false, error: { code: "INVALID_REQUEST", message: "Prompt is required as a string" } });
    }
    
    validateRequest({ ...body, prompt });

    const { output } = await generateWithRotation(config, { ...body, prompt, requestId });

    // Normalize AI output to structured metadata
    let finalResult;
    try {
      finalResult = normalizeMetadata(output.result, body.settings);
    } catch (err) {
       console.error("[Proxy] Normalization failed:", err.message);
       throw new Error(`AI returned invalid format: ${err.message}`);
    }

    const totalLatencyMs = Date.now() - requestStart;
    const userEmail = keyRecord.userEmail || keyRecord.email || null;

    // Non-blocking background telemetry & stats writes (Zero synchronous hot-path delay)
    const tokenHash = sha256(token) || token;
    backgroundTask(Promise.allSettled([
      recordApiTelemetry({
        requestId,
        endpoint: "/api/generate",
        method: "POST",
        statusCode: 200,
        totalLatencyMs,
        finalProvider: output.provider,
        finalModel: output.model,
        finalKeyId: output.keyId,
        finalKeyPreview: output.keyPreview,
        attempts: output.attempts || [],
        clientIp,
        userEmail
      }),
      trackUsage(output.provider, output.model, "success"),
      Math.random() < 0.1 ? updateKeyLastUsed(tokenHash) : Promise.resolve()
    ]), executionContext);

    // Identical legacy response payload for 100% backward compatibility
    return json(200, {
      ok: true,
      provider: output.provider,
      model: output.model,
      rawResult: output.result,
      ...finalResult,
      usage: output.usage
    });
  } catch (error) {
    console.error("[Proxy] Generate Error:", error);
    
    let lastProvider = "none";
    let lastModel = "none";

    if (error.details && error.details.length > 0) {
      const last = error.details[error.details.length - 1];
      lastProvider = last.provider;
      lastModel = last.model;
      trackUsage(lastProvider, lastModel, "error").catch(() => {});
    }

    const statusCode = error.statusCode || 500;
    const totalLatencyMs = Date.now() - requestStart;

    // Background telemetry write
    backgroundTask(recordApiTelemetry({
      requestId,
      endpoint: "/api/generate",
      method: "POST",
      statusCode,
      totalLatencyMs,
      finalProvider: lastProvider,
      finalModel: lastModel,
      attempts: error.attempts || [],
      clientIp,
      errorCode: statusCode === 502 ? "NO_PROVIDER_AVAILABLE" : "GENERATE_ERROR",
      errorMessage: error.message
    }), executionContext);

    return json(statusCode, {
      ok: false,
      error: {
        code: statusCode === 502 ? "NO_PROVIDER_AVAILABLE" : "GENERATE_ERROR",
        message: error.message,
        retryAfter: statusCode === 502 ? 3 : undefined,
        details: error.details || undefined
      }
    });
  }
}

export default vercelHandler(handler);
