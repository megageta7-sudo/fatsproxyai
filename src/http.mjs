export const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": process.env.ALLOWED_ORIGIN || "*",
  "access-control-allow-headers": "content-type, authorization, x-admin-token",
  "access-control-allow-methods": "GET, POST, OPTIONS"
};

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;
const rateLimitMap = new Map();

let lastCleanup = Date.now();

export function checkRateLimit(ip) {
  const now = Date.now();
  
  // Lazy cleanup every window period
  if (now - lastCleanup > RATE_LIMIT_WINDOW) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now - value.startTime > RATE_LIMIT_WINDOW) {
        rateLimitMap.delete(key);
      }
    }
    lastCleanup = now;
  }

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return true;
  }

  const record = rateLimitMap.get(ip);
  if (now - record.startTime > RATE_LIMIT_WINDOW) {
    record.count = 1;
    record.startTime = now;
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count += 1;
  return true;
}

export function optionsResponse() {
  return {
    statusCode: 204,
    headers: jsonHeaders,
    body: ""
  };
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  };
}

/**
 * Normalizes headers from either Netlify (event.headers) or Vercel (req.headers)
 */
function getHeader(source, name) {
  const headers = source.headers || {};
  return headers[name.toLowerCase()] || headers[name] || "";
}

export function readJson(event) {
  // If event.body is already an object (Vercel's default behavior for JSON)
  if (event.body && typeof event.body === "object") {
    return event.body;
  }
  
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    const error = new Error("Body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

export function requireAdmin(event) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    const error = new Error("ADMIN_TOKEN is not configured");
    error.statusCode = 500;
    throw error;
  }

  const actual = getHeader(event, "x-admin-token");
  if (actual !== expected) {
    const error = new Error("Invalid admin token");
    error.statusCode = 401;
    throw error;
  }
}

export function bearerToken(event) {
  const header = getHeader(event, "authorization");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

import crypto from "node:crypto";

/**
 * Helper to adapt Netlify-style handler to Vercel Serverless Function
 */
export function vercelHandler(handler) {
  return async (req, res) => {
    // Vercel uses req.method instead of event.httpMethod
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      body: req.body,
      queryStringParameters: req.query,
      path: req.url
    };

    const requestId = getHeader(event, "x-request-id") || `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    event.requestId = requestId;

    const executionContext = {
      waitUntil: (promise) => {
        if (req.context && typeof req.context.waitUntil === "function") {
          req.context.waitUntil(promise);
        }
      }
    };
    event.executionContext = executionContext;

    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    if (!checkRateLimit(ip)) {
      res.setHeader("X-Request-Id", requestId);
      return res.status(429).json({ ok: false, error: "Too many requests" });
    }

    const result = await handler(event, executionContext);

    // Apply headers
    res.setHeader("X-Request-Id", requestId);
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
    }

    res.status(result.statusCode || 200).send(result.body);
  };
}


