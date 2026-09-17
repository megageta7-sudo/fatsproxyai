import { json, optionsResponse, requireAdmin, vercelHandler } from "../src/http.mjs";
import { handler as configHandler } from "../src/admin/config.mjs";
import { handler as healthHandler } from "../src/admin/health.mjs";
import { handler as keysHandler } from "../src/admin/keys.mjs";
import { handler as statsHandler } from "../src/admin/stats.mjs";
import { handler as extensionKeyHandler } from "../src/admin/extensionKey.mjs";

async function router(event, executionContext) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    requireAdmin(event); // Single Admin Auth for all admin endpoints

    const rawPath = (event.path || event.url || "").split("?")[0].toLowerCase();
    const queryRoute = String(event.queryStringParameters?.route || "").toLowerCase();

    const isMatch = (segment) => queryRoute.includes(segment) || rawPath.includes(`/${segment}`) || rawPath.endsWith(segment);

    if (isMatch("health")) {
      return healthHandler(event, executionContext);
    }
    if (isMatch("keys") || isMatch("test-keys")) {
      return keysHandler(event, executionContext);
    }
    if (isMatch("extension-key")) {
      return extensionKeyHandler(event, executionContext);
    }
    if (isMatch("stats")) {
      return statsHandler(event, executionContext);
    }
    if (isMatch("auth")) {
      return json(200, {
        ok: true,
        message: "Authenticated",
        timestamp: new Date().toISOString()
      });
    }

    // Default to config handler for /api/admin/config or /api/admin
    return configHandler(event, executionContext);
  } catch (error) {
    return json(error.statusCode || 500, {
      ok: false,
      error: {
        code: error.code || "ADMIN_ERROR",
        message: error.message
      }
    });
  }
}

export default vercelHandler(router);
