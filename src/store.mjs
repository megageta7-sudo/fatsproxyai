import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, admin } from "./firebase.mjs";
import { sha256 } from "./crypto.mjs";
import redis from "./redis.mjs";

const CONFIG_ID = process.env.CONFIG_ID || "";
const CONFIG_DOC_ID = CONFIG_ID ? `proxy-settings-${CONFIG_ID}` : "proxy-settings";
const REDIS_CONFIG_KEY = CONFIG_ID ? `config:global:${CONFIG_ID}` : "config:global";
const COLLECTION_NAME = "config";
const STATS_COLLECTION = CONFIG_ID ? `stats-${CONFIG_ID}` : "stats";
const LOGS_COLLECTION = CONFIG_ID ? `logs-${CONFIG_ID}` : "logs";
const CHATS_COLLECTION = CONFIG_ID ? `chats-${CONFIG_ID}` : "chats";
const USERS_COLLECTION = CONFIG_ID ? `users-${CONFIG_ID}` : "users";
const LOCAL_DATA_DIR = path.join(process.cwd(), ".data");
const LOCAL_CONFIG_PATH = CONFIG_ID ? path.join(LOCAL_DATA_DIR, `config-${CONFIG_ID}.json`) : path.join(LOCAL_DATA_DIR, "config.json");
const CONFIG_CACHE_TTL = 60 * 1000; // 1 minute
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cachedConfig = null;
let lastCacheUpdate = 0;
const userConfigCache = new Map();

function parseEnvKeys(key) {
  const value = process.env[key];
  if (!value) return [];
  return value.split(",").map(k => k.trim()).filter(Boolean);
}

const defaultConfig = {
  version: 2,
  updatedAt: null,
  providerOrder: ["groq", "gemini", "mistral", "nvidia", "xkiro"],
  groq: {
    model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
    keys: parseEnvKeys("GROQ_KEYS"),
    cursor: 0
  },
  gemini: {
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    keys: parseEnvKeys("GEMINI_KEYS"),
    cursor: 0
  },
  mistral: {
    model: process.env.MISTRAL_MODEL || "mistral-tiny",
    keys: parseEnvKeys("MISTRAL_KEYS"),
    cursor: 0
  },
  nvidia: {
    model: process.env.NVIDIA_MODEL || "mistralai/mistral-large-3-675b-instruct-2512",
    keys: parseEnvKeys("NVIDIA_KEYS"),
    cursor: 0
  },
  xkiro: {
    model: process.env.XKIRO_MODEL || "google/gemini-2.5-flash",
    keys: parseEnvKeys("XKIRO_KEYS"),
    cursor: 0
  },
  extensionKeys: parseEnvKeys("EXTENSION_KEYS").map(k => ({
    name: "Env Key",
    hash: k,
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  }))
};

function shouldUseLocalStore() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return process.env.LOCAL_FILE_STORE === "1";
}

async function readLocalConfig() {
  try {
    const raw = await readFile(LOCAL_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeLocalConfig(config) {
  try {
    await mkdir(LOCAL_DATA_DIR, { recursive: true });
    await writeFile(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to write local config (likely read-only filesystem):", err.message);
  }
}

export async function loadConfig(force = false) {
  const now = Date.now();
  if (!force && cachedConfig && (now - lastCacheUpdate < CONFIG_CACHE_TTL)) {
    return cachedConfig;
  }

  // Layer 2: Redis cache (survives cold start across instances)
  if (!force && redis) {
    try {
      const redisConfig = await redis.get(REDIS_CONFIG_KEY);
      if (redisConfig) {
        cachedConfig = typeof redisConfig === 'string' ? JSON.parse(redisConfig) : redisConfig;
        lastCacheUpdate = now;
        return cachedConfig;
      }
    } catch (e) { /* fallthrough to Firestore */ }
  }

  // Layer 3: Firestore (source of truth)
  let config;
  try {
    if (shouldUseLocalStore()) {
      config = await readLocalConfig();
    } else {
      const doc = await db.collection(COLLECTION_NAME).doc(CONFIG_DOC_ID).get();
      if (doc.exists) {
        config = doc.data();
      }
    }
  } catch (err) {
    console.error("Error loading config from Firestore:", err.message);
  }

  // Merge logic
  const merged = {
    ...defaultConfig,
    ...(config || {}),
    groq: {
      ...defaultConfig.groq,
      ...(config?.groq || {}),
      keys: (config?.groq?.keys?.length ? config.groq.keys : defaultConfig.groq.keys)
    },
    gemini: {
      ...defaultConfig.gemini,
      ...(config?.gemini || {}),
      keys: (config?.gemini?.keys?.length ? config.gemini.keys : defaultConfig.gemini.keys)
    },
    mistral: {
      ...defaultConfig.mistral,
      ...(config?.mistral || {}),
      keys: (config?.mistral?.keys?.length ? config.mistral.keys : defaultConfig.mistral.keys)
    },
    nvidia: {
      ...defaultConfig.nvidia,
      ...(config?.nvidia || {}),
      keys: (config?.nvidia?.keys?.length ? config.nvidia.keys : defaultConfig.nvidia.keys)
    },
    xkiro: {
      ...defaultConfig.xkiro,
      ...(config?.xkiro || {}),
      keys: (config?.xkiro?.keys?.length ? config.xkiro.keys : defaultConfig.xkiro.keys)
    },
    extensionKeys: (config?.extensionKeys?.length ? config.extensionKeys : defaultConfig.extensionKeys)
  };

  // Reconcile providerOrder: Ensure new system providers are added to the list if missing
  const currentOrder = Array.isArray(merged.providerOrder) ? merged.providerOrder : defaultConfig.providerOrder;
  const systemProviders = ["groq", "gemini", "mistral", "nvidia", "xkiro"];
  const missingProviders = systemProviders.filter(p => !currentOrder.includes(p));
  
  if (missingProviders.length > 0) {
    merged.providerOrder = [...currentOrder, ...missingProviders];
  }

  // Save to Redis cache for other instances
  if (redis && merged) {
    redis.set(REDIS_CONFIG_KEY, JSON.stringify(merged), { ex: 60 }).catch(() => {});
  }

  cachedConfig = merged;
  lastCacheUpdate = now;
  return merged;
}

export async function saveConfig(config) {
  const next = {
    ...config,
    updatedAt: new Date().toISOString()
  };

  // Ensure AI keys are deduplicated before saving
  if (next.groq?.keys) next.groq.keys = [...new Set(next.groq.keys)];
  if (next.gemini?.keys) next.gemini.keys = [...new Set(next.gemini.keys)];
  if (next.mistral?.keys) next.mistral.keys = [...new Set(next.mistral.keys)];
  if (next.nvidia?.keys) next.nvidia.keys = [...new Set(next.nvidia.keys)];
  if (next.xkiro?.keys) next.xkiro.keys = [...new Set(next.xkiro.keys)];

  if (shouldUseLocalStore()) {
    await writeLocalConfig(next);
  } else {
    try {
      await db.collection(COLLECTION_NAME).doc(CONFIG_DOC_ID).set(next, { merge: true });
    } catch (err) {
      console.error("Error saving config to Firestore:", err.message);
      throw err;
    }
  }

  cachedConfig = next;
  lastCacheUpdate = Date.now();
  return next;
}

export async function updateProviderCursor(provider, nextCursor) {
  if (shouldUseLocalStore()) {
    const config = await loadConfig();
    if (config[provider]) {
      config[provider].cursor = nextCursor;
      await saveConfig(config);
    }
    return;
  }

  try {
    await db.collection(COLLECTION_NAME).doc(CONFIG_DOC_ID).update({
      [`${provider}.cursor`]: nextCursor,
      updatedAt: new Date().toISOString()
    });
    // Update local cache if exists
    if (cachedConfig && cachedConfig[provider]) {
      cachedConfig[provider].cursor = nextCursor;
    }
  } catch (err) {
    console.error(`Error updating cursor for ${provider}:`, err.message);
  }
}

export async function updateKeyLastUsed(tokenHashOrKey) {
  const config = await loadConfig();
  // We need sha256 here, but it's not imported. I'll import it.
  // Actually, I can just use the provided tokenHash if the caller provides it.
  const keyIndex = config.extensionKeys.findIndex(k => k.hash === tokenHashOrKey);
  
  if (keyIndex === -1) return;

  const now = new Date().toISOString();
  config.extensionKeys[keyIndex].lastUsedAt = now;

  if (shouldUseLocalStore()) {
    await saveConfig(config);
    return;
  }

  try {
    await db.collection(COLLECTION_NAME).doc(CONFIG_DOC_ID).update({
      extensionKeys: config.extensionKeys,
      updatedAt: now
    });
  } catch (err) {
    console.error("Error updating key lastUsedAt:", err.message);
  }
}

export async function trackUsage(provider, model, status = "success") {
  if (shouldUseLocalStore()) return; // Skip local for now to avoid IO overhead

  try {
    const statsRef = db.collection(STATS_COLLECTION).doc("global");
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    
    // Increments using Firestore FieldValue.increment
    const update = {
      total: admin.firestore.FieldValue.increment(1),
      [`providers.${provider}.total`]: admin.firestore.FieldValue.increment(1),
      [`models.${model.replace(/\./g, '_')}.total`]: admin.firestore.FieldValue.increment(1),
      [`status.${status}`]: admin.firestore.FieldValue.increment(1),
      [`history.${dateStr}.total`]: admin.firestore.FieldValue.increment(1),
      [`history.${dateStr}.${status}`]: admin.firestore.FieldValue.increment(1)
    };

    await statsRef.set(update, { merge: true });
  } catch (err) {
    console.error("Error tracking usage:", err.message);
  }
}

export async function recordLog(details) {
  if (shouldUseLocalStore()) return;

  try {
    const logRef = db.collection(LOGS_COLLECTION).doc();
    await logRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      time: new Date().toISOString(),
      ...details
    });

    // Keep logs lean - maybe delete old logs? 
    // For now, just save.
  } catch (err) {
    console.error("Error recording log:", err.message);
  }
}

export async function loadChatHistory(chatId, limit = 10) {
  if (shouldUseLocalStore()) return [];

  try {
    const snapshot = await db.collection(CHATS_COLLECTION)
      .doc(String(chatId))
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data()).reverse();
  } catch (err) {
    console.error("Error loading chat history:", err.message);
    return [];
  }
}

export async function saveChatMessage(chatId, role, text, messageId = null) {
  if (shouldUseLocalStore()) return;

  try {
    await db.collection(CHATS_COLLECTION)
      .doc(String(chatId))
      .collection("messages")
      .add({
        role,
        text,
        messageId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    console.error("Error saving chat message:", err.message);
  }
}

export async function clearChatHistory(chatId) {
  if (shouldUseLocalStore()) return;

  try {
    const messagesRef = db.collection(CHATS_COLLECTION).doc(String(chatId)).collection("messages");
    let snapshot;
    do {
      snapshot = await messagesRef.limit(400).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } while (!snapshot.empty);
  } catch (err) {
    console.error("Error clearing chat history:", err.message);
    throw err;
  }
}

export async function loadUserConfig(chatId) {
  const cacheKey = String(chatId);

  // Layer 1: Redis cache (survives cold start and shared across instances)
  if (redis) {
    try {
      const redisData = await redis.get(`uc:${cacheKey}`);
      if (redisData) {
        return typeof redisData === 'string' ? JSON.parse(redisData) : redisData;
      }
    } catch (e) { /* fallthrough to Firestore/Local */ }
  }

  // Layer 2: Firestore / Local Store (source of truth)
  if (shouldUseLocalStore()) {
    const config = await readLocalConfig();
    return config?.users?.[cacheKey] || { mode: "istri" };
  }

  try {
    if (!db) throw new Error("Database not initialized");
    const doc = await db.collection(USERS_COLLECTION).doc(cacheKey).get();
    let data;
    if (doc.exists) {
      data = { mode: "istri", ...doc.data() };
    } else {
      data = { mode: "istri" };
    }
    if (redis) {
      redis.set(`uc:${cacheKey}`, JSON.stringify(data), { ex: 300 }).catch(() => {});
    }
    return data;
  } catch (err) {
    console.error("Error loading user config:", err.message);
    return { mode: "istri" };
  }
}

export async function saveUserConfig(chatId, data) {
  const cacheKey = String(chatId);

  // Update Redis cache (instantly available to all serverless instances)
  if (redis) {
    redis.set(`uc:${cacheKey}`, JSON.stringify(data), { ex: 300 }).catch(() => {});
  }

  if (shouldUseLocalStore()) {
    const config = await loadConfig();
    if (!config.users) config.users = {};
    config.users[cacheKey] = { ...(config.users[cacheKey] || {}), ...data };
    await saveConfig(config);
    return;
  }

  try {
    if (!db) throw new Error("Database not initialized");
    await db.collection(USERS_COLLECTION).doc(cacheKey).set(data, { merge: true });
  } catch (err) {
    console.error("Error saving user config:", err.message);
  }
}



