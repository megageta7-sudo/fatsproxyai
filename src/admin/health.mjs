import { json, optionsResponse, requireAdmin } from "../http.mjs";
import { loadConfig } from "../store.mjs";
import { getKeyOperationalStatus, getActiveAlerts } from "../telemetry.mjs";

const PROVIDERS = ["groq", "gemini", "mistral", "nvidia", "xkiro"];

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  
  try {
    requireAdmin(event);

    const config = await loadConfig();
    const activeAlerts = await getActiveAlerts();

    const providerHealth = {};
    let totalKeysCount = 0;
    let healthyKeysCount = 0;
    let rateLimitedKeysCount = 0;
    let invalidKeysCount = 0;

    for (const provider of PROVIDERS) {
      const providerConfig = config[provider] || { keys: [], model: "default" };
      const rawKeys = providerConfig.keys || [];
      const keyStatuses = [];

      for (const key of rawKeys) {
        totalKeysCount += 1;
        const keyId = key.id;
        const preview = key.preview || (key.key ? `${key.key.slice(0, 6)}...${key.key.slice(-4)}` : "unknown");
        const isActive = key.active !== false;

        const opStatus = await getKeyOperationalStatus(provider, keyId);

        let finalStatus = opStatus.status;
        if (!isActive) finalStatus = "disabled";

        if (finalStatus === "healthy") healthyKeysCount += 1;
        else if (finalStatus === "rate_limited") rateLimitedKeysCount += 1;
        else if (finalStatus === "invalid") invalidKeysCount += 1;

        keyStatuses.push({
          id: keyId,
          preview,
          active: isActive,
          status: finalStatus,
          cooldownRemaining: opStatus.cooldownRemaining || 0,
          latencyMs: opStatus.latencyMs || null,
          createdAt: key.createdAt || null
        });
      }

      // Compute aggregate provider status
      let providerStatus = "operational";
      if (keyStatuses.length === 0) {
        providerStatus = "no_keys";
      } else {
        const hasHealthy = keyStatuses.some(k => k.status === "healthy" && k.active);
        const hasRateLimited = keyStatuses.some(k => k.status === "rate_limited");
        const allInvalid = keyStatuses.every(k => k.status === "invalid" || !k.active);

        if (!hasHealthy && hasRateLimited) {
          providerStatus = "cooldown";
        } else if (allInvalid) {
          providerStatus = "offline";
        } else if (!hasHealthy) {
          providerStatus = "degraded";
        }
      }

      providerHealth[provider] = {
        name: provider,
        model: providerConfig.model,
        status: providerStatus,
        keyCount: keyStatuses.length,
        keys: keyStatuses
      };
    }

    return json(200, {
      ok: true,
      summary: {
        totalKeys: totalKeysCount,
        healthyKeys: healthyKeysCount,
        rateLimitedKeys: rateLimitedKeysCount,
        invalidKeys: invalidKeysCount,
        alertCount: activeAlerts.length,
        timestamp: new Date().toISOString()
      },
      providers: providerHealth,
      alerts: activeAlerts
    });
  } catch (err) {
    return json(err.statusCode || 500, {
      ok: false,
      error: { code: "HEALTH_CHECK_ERROR", message: err.message }
    });
  }
}
