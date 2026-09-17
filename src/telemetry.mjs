import redis from "./redis.mjs";
import { supabase, isSupabaseConfigured } from "./supabase.mjs";

export const TELEMETRY_ENABLED = process.env.TELEMETRY_ENABLED !== "false";
export const SUPABASE_LOGGING_ENABLED = process.env.SUPABASE_LOGGING_ENABLED !== "false";
export const KEY_METRICS_ENABLED = process.env.KEY_METRICS_ENABLED !== "false";

const DEFAULT_COOLDOWN_SECONDS = 60;
const MAX_COOLDOWN_SECONDS = 300;
const CONSECUTIVE_ERROR_THRESHOLD = 3;

/**
 * Executes a task in the background without blocking the hot path.
 * If serverless execution context (waitUntil) is provided, uses it.
 */
export function backgroundTask(taskPromiseOrFn, executionContext = null) {
  const promise = typeof taskPromiseOrFn === "function" 
    ? Promise.resolve().then(taskPromiseOrFn)
    : Promise.resolve(taskPromiseOrFn);

  const safePromise = promise.catch((err) => {
    console.warn("[Telemetry Background Error]", err.message || err);
  });

  if (executionContext && typeof executionContext.waitUntil === "function") {
    try {
      executionContext.waitUntil(safePromise);
    } catch (e) {
      // Ignore if waitUntil not supported
    }
  }

  return safePromise;
}

/**
 * Record a full API request and all its rotation attempts into Supabase.
 * Strictly non-blocking.
 */
export async function recordApiTelemetry({
  requestId,
  endpoint,
  method = "POST",
  statusCode = 200,
  totalLatencyMs = 0,
  finalProvider = "none",
  finalModel = "none",
  finalKeyId = "none",
  finalKeyPreview = "",
  attempts = [],
  clientIp = "unknown",
  userEmail = null,
  errorCode = null,
  errorMessage = null
}) {
  if (!TELEMETRY_ENABLED || !SUPABASE_LOGGING_ENABLED || !isSupabaseConfigured || !supabase) {
    return;
  }

  try {
    // 1. Insert api_requests row
    const requestRow = {
      request_id: requestId,
      endpoint,
      method,
      status_code: statusCode,
      total_latency_ms: Math.round(totalLatencyMs),
      final_provider: finalProvider,
      final_model: finalModel,
      final_key_id: finalKeyId,
      final_key_preview: finalKeyPreview,
      attempts_count: attempts.length || 1,
      client_ip: clientIp,
      user_email: userEmail,
      error_code: errorCode,
      error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null
    };

    const { error: reqError } = await supabase.from("api_requests").insert(requestRow);
    if (reqError) {
      console.warn("[Telemetry] Supabase api_requests insert failed:", reqError.message);
      return;
    }

    // 2. Insert api_attempts rows if any
    if (Array.isArray(attempts) && attempts.length > 0) {
      const attemptRows = attempts.map((att, idx) => ({
        request_id: requestId,
        attempt_number: idx + 1,
        provider: att.provider,
        model: att.model || "unknown",
        key_id: att.keyId,
        key_preview: att.keyPreview || "",
        key_hash: att.keyHash || null,
        status_code: att.statusCode || null,
        error_code: att.errorCode || null,
        latency_ms: Math.round(att.latencyMs || 0),
        error_message: att.errorMessage ? String(att.errorMessage).slice(0, 1000) : null,
        is_success: Boolean(att.isSuccess)
      }));

      const { error: attError } = await supabase.from("api_attempts").insert(attemptRows);
      if (attError) {
        console.warn("[Telemetry] Supabase api_attempts insert failed:", attError.message);
      }
    }
  } catch (err) {
    console.warn("[Telemetry] recordApiTelemetry failed:", err.message);
  }
}

/**
 * Record attempt metrics and maintain key operational health in Redis.
 */
export async function recordKeyOperationalMetric({
  provider,
  keyId,
  keyHash,
  keyPreview,
  statusCode,
  errorCode,
  latencyMs,
  errorMessage,
  isSuccess,
  retryAfterSeconds,
  isDiagnostic = false
}) {
  if (!KEY_METRICS_ENABLED || !redis) return;

  const healthKey = `health:${provider}:${keyId}`;
  const cooldownKey = `cooldown:${provider}:${keyId}`;
  const errorCounterKey = `errors_consecutive:${provider}:${keyId}`;
  const latencyKey = `latency:${provider}:${keyId}`;
  const alertId = `alert:${provider}:${keyId}`;

  try {
    if (isSuccess) {
      // Reset consecutive error counter
      await redis.del(errorCounterKey);

      // If key was marked degraded or invalid, recover to healthy
      const currentHealth = await redis.get(healthKey);
      if (currentHealth && currentHealth !== "healthy") {
        await redis.set(healthKey, "healthy");
        await removeActiveAlert(alertId);
      }

      // Record latest latency (skip for diagnostic to avoid skewing prod metrics)
      if (latencyMs > 0 && !isDiagnostic) {
        await redis.set(latencyKey, String(Math.round(latencyMs)), { ex: 3600 });
      }
      return;
    }

    // Handle Failures
    const status = Number(statusCode || 0);

    // 1. Model Not Found / Invalid Model Configuration:
    // Key is NOT at fault. Do NOT degrade key health or increment failure counter.
    if (errorCode === "MODEL_NOT_FOUND") {
      await addActiveAlert({
        id: `alert:model_error:${provider}`,
        type: "MODEL_ERROR",
        provider,
        keyId,
        keyPreview,
        message: `Model tidak tersedia di ${provider} (${errorMessage || 'MODEL_NOT_FOUND'}). Key terhubung & valid, periksa nama model di Model Settings.`,
        timestamp: new Date().toISOString()
      }, isDiagnostic ? 60 : 300);
      return;
    }

    // 2. Auth Failure (Invalid / Revoked / Leaked Key)
    if (errorCode === "AUTH_FAILED" || status === 401 || status === 403) {
      // Invalid or revoked key
      await redis.set(healthKey, "invalid", { ex: 86400 }); // 24 hours
      await addActiveAlert({
        id: `${alertId}:invalid`,
        type: "INVALID_KEY",
        provider,
        keyId,
        keyPreview,
        message: `API key invalid atau dicabut (${errorMessage || `HTTP ${status}`}).`,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 3. Rate Limited / Quota Exceeded
    if (errorCode === "RATE_LIMITED" || status === 429) {
      // Rate limited: Use Retry-After if provided, else default cooldown with cap
      const cooldownSec = Math.min(
        Math.max(10, Number(retryAfterSeconds) || DEFAULT_COOLDOWN_SECONDS),
        MAX_COOLDOWN_SECONDS
      );

      await redis.set(healthKey, "rate_limited", { ex: cooldownSec });

      // Diagnostic mode: mark status but skip production cooldown timers (Reviewer point 13)
      if (!isDiagnostic) {
        await redis.set(cooldownKey, String(Date.now() + cooldownSec * 1000), { ex: cooldownSec });
      }

      await addActiveAlert({
        id: `${alertId}:rate_limited`,
        type: "RATE_LIMITED",
        provider,
        keyId,
        keyPreview,
        message: `Rate limit tercapai${isDiagnostic ? ' (diagnostic test)' : ''}. Cooldown ${cooldownSec} detik.`,
        cooldownSeconds: cooldownSec,
        timestamp: new Date().toISOString()
      }, cooldownSec);
      return;
    }

    // 5xx or Upstream Timeout: Apply damping threshold (Reviewer point 12)
    // Diagnostic mode: still increment error counter so repeated diagnostic failures
    // correctly mark degraded, but use shorter TTL to auto-recover faster
    const errCount = await redis.incr(errorCounterKey);
    await redis.expire(errorCounterKey, isDiagnostic ? 60 : 120);

    if (errCount >= CONSECUTIVE_ERROR_THRESHOLD) {
      await redis.set(healthKey, "degraded", { ex: isDiagnostic ? 60 : 120 });
      await addActiveAlert({
        id: `${alertId}:degraded`,
        type: "DEGRADED",
        provider,
        keyId,
        keyPreview,
        message: `Kunci mengalami ${errCount} kegagalan berturut-turut${isDiagnostic ? ' (diagnostic test)' : ''} (${errorCode || status || 'error'}).`,
        timestamp: new Date().toISOString()
      }, isDiagnostic ? 60 : 120);
    }
  } catch (err) {
    console.warn("[Telemetry] recordKeyOperationalMetric failed:", err.message);
  }
}

/**
 * Fetch operational status for a key from Redis.
 */
export async function getKeyOperationalStatus(provider, keyId) {
  if (!redis) {
    return { status: "healthy", cooldownRemaining: 0, latencyMs: null };
  }

  try {
    const healthKey = `health:${provider}:${keyId}`;
    const cooldownKey = `cooldown:${provider}:${keyId}`;
    const disabledKey = `disabled:${provider}:${keyId}`;
    const latencyKey = `latency:${provider}:${keyId}`;

    const [health, cooldownUntil, isDisabled, latency] = await Promise.all([
      redis.get(healthKey),
      redis.get(cooldownKey),
      redis.get(disabledKey),
      redis.get(latencyKey)
    ]);

    if (isDisabled) {
      return { status: "disabled", cooldownRemaining: 0, latencyMs: latency ? Number(latency) : null };
    }

    let cooldownRemaining = 0;
    if (cooldownUntil) {
      cooldownRemaining = Math.max(0, Math.round((Number(cooldownUntil) - Date.now()) / 1000));
    }

    return {
      status: health || "healthy",
      cooldownRemaining,
      latencyMs: latency ? Number(latency) : null
    };
  } catch (e) {
    return { status: "healthy", cooldownRemaining: 0, latencyMs: null };
  }
}

/**
 * Alert Management helpers
 */
const ACTIVE_ALERTS_KEY = "alerts:active_set";

async function addActiveAlert(alertData, ttlSeconds = 3600) {
  if (!redis) return;
  try {
    const alertKey = `alert_data:${alertData.id}`;
    await redis.set(alertKey, JSON.stringify(alertData), { ex: ttlSeconds });
    await redis.sadd(ACTIVE_ALERTS_KEY, alertData.id);
  } catch (e) {}
}

async function removeActiveAlert(alertIdPrefix) {
  if (!redis) return;
  try {
    const alertIds = await redis.smembers(ACTIVE_ALERTS_KEY);
    const toRemove = alertIds.filter(id => id.startsWith(alertIdPrefix));
    if (toRemove.length > 0) {
      await Promise.all([
        redis.srem(ACTIVE_ALERTS_KEY, ...toRemove),
        ...toRemove.map(id => redis.del(`alert_data:${id}`))
      ]);
    }
  } catch (e) {}
}

export async function getActiveAlerts() {
  if (!redis) return [];
  try {
    const alertIds = await redis.smembers(ACTIVE_ALERTS_KEY);
    if (!alertIds || alertIds.length === 0) return [];

    const rawDataList = await Promise.all(alertIds.map(id => redis.get(`alert_data:${id}`)));
    const alerts = [];
    const expiredIds = [];

    rawDataList.forEach((raw, i) => {
      if (raw) {
        alerts.push(typeof raw === "string" ? JSON.parse(raw) : raw);
      } else {
        expiredIds.push(alertIds[i]);
      }
    });

    if (expiredIds.length > 0) {
      redis.srem(ACTIVE_ALERTS_KEY, ...expiredIds).catch(() => {});
    }

    return alerts;
  } catch (e) {
    return [];
  }
}
