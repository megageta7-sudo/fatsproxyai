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

    const rawPath = (event.path || event.url || "").split("?")[0];
    const route = event.queryStringParameters?.route || rawPath.replace(/^\/api\/admin\/?/, "");

    if (route.includes("health")) {
      return healthHandler(event, executionContext);
    }
    if (route.includes("keys") || route.includes("test-keys")) {
      return keysHandler(event, executionContext);
    }
    if (route.includes("extension-key")) {
      return extensionKeyHandler(event, executionContext);
    }
    if (route.includes("stats")) {
      return statsHandler(event, executionContext);
    }
    if (route.includes("auth")) {
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
