import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env manually if present
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Route Rewrites Mapping
const STATIC_REWRITES = {
  "/": "/public/admin.html",
  "/admin": "/public/admin.html",
  "/admin.html": "/public/admin.html",
  "/tester": "/public/tester.html",
  "/tester.html": "/public/tester.html",
  "/logs": "/public/logs.html",
  "/thankyou": "/public/thankyou.html",
  "/flow-success": "/public/flow-success.html"
};

const API_REWRITES = {
  "/api/generate": "./api/generate.js",
  "/api/logs": "./api/logs.js",
  "/api/admin/health": "./api/admin/health.js",
  "/api/admin/keys": "./api/admin/keys.js",
  "/api/admin/config": "./api/admin/config.js",
  "/api/admin/auth": "./api/admin/auth.js",
  "/api/admin/test-keys": "./api/admin/test-keys.js",
  "/api/admin/extension-key": "./api/admin/extension-key.js",
  "/api/admin/stats": "./api/admin/stats.js",
  "/api/mistral": "./api/mistral.js",
  "/api/webhook-lynkid": "./api/subscription.js",
  "/api/start-trial": "./api/subscription.js",
  "/api/ext/login": "./api/ext-login.js",
  "/api/flow-privacy": "./api/flow-privacy.js",
  "/api/privacy-policy": "./api/flow-privacy.js"
};

// Cached modules for fast execution
const moduleCache = new Map();

async function getHandler(filePath) {
  const fullPath = path.resolve(__dirname, filePath);
  if (moduleCache.has(fullPath)) {
    return moduleCache.get(fullPath);
  }
  const mod = await import(`file://${fullPath}`);
  const handler = mod.default || mod.handler;
  moduleCache.set(fullPath, handler);
  return handler;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-admin-token, x-request-id");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;

  // Static File Rewrites
  if (STATIC_REWRITES[pathname]) {
    const targetFile = path.join(__dirname, STATIC_REWRITES[pathname]);
    if (fs.existsSync(targetFile)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(targetFile).pipe(res);
    }
  }

  // Serve static files from public/ directly (CSS, JS, images)
  let staticPath = null;
  if (pathname.startsWith("/css/") || pathname.startsWith("/js/") || pathname.startsWith("/public/")) {
    staticPath = path.join(__dirname, pathname.startsWith("/public/") ? pathname : `public${pathname}`);
  } else {
    const directPublic = path.join(__dirname, "public", pathname.slice(1));
    if (pathname !== "/" && fs.existsSync(directPublic) && fs.statSync(directPublic).isFile()) {
      staticPath = directPublic;
    }
  }

  if (staticPath && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    return fs.createReadStream(staticPath).pipe(res);
  }

  // Handle API Requests
  if (pathname.startsWith("/api/")) {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    // Determine target API script
    let targetScript = API_REWRITES[pathname];
    if (!targetScript) {
      // Dynamic lookup: /api/x/y -> ./api/x/y.js
      const candidate = `./${pathname.slice(1)}.js`;
      if (fs.existsSync(path.resolve(__dirname, candidate))) {
        targetScript = candidate;
      }
    }

    if (!targetScript) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "API endpoint not found" }));
    }

    // Read request body
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let parsedBody = rawBody;
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("application/json") && rawBody.trim()) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = rawBody;
        }
      }

      // Convert query string to object
      const query = {};
      for (const [key, value] of urlObj.searchParams.entries()) {
        query[key] = value;
      }

      // Enhance req and res objects for Vercel/Express compatibility
      req.body = parsedBody;
      req.query = query;

      res.status = function (statusCode) {
        res.statusCode = statusCode;
        return res;
      };

      res.json = function (data) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };

      res.send = function (data) {
        if (typeof data === "object" && !Buffer.isBuffer(data)) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        } else {
          res.end(data);
        }
      };

      try {
        const handler = await getHandler(targetScript);
        if (typeof handler !== "function") {
          res.status(500).json({ ok: false, error: "Invalid handler export" });
          return;
        }
        await handler(req, res);
      } catch (err) {
        console.error(`[DevServer Error] ${pathname}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: err.message || "Internal server error" });
        }
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end(`404 Not Found: ${pathname}`);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n" + "=".repeat(64));
  console.log(" 🚀 MEGA VERCEL AI PROXY - LOCAL DEVELOPMENT SERVER");
  console.log("=".repeat(64));
  console.log(`  ► Local Server : http://localhost:${PORT}`);
  console.log(`  ► Admin Center : http://localhost:${PORT}/admin`);
  console.log(`  ► API Tester   : http://localhost:${PORT}/tester`);
  console.log(`  ► API Endpoint : http://localhost:${PORT}/api/generate`);
  console.log("=".repeat(64));
  console.log("  Ready to accept connections. Press Ctrl+C to stop.\n");
});
