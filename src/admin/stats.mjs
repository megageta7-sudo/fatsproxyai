import { json, optionsResponse, requireAdmin } from "../http.mjs";
import { db } from "../firebase.mjs";
import { loadConfig } from "../store.mjs";

function unflatten(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  
  try {
    requireAdmin(event);
    
    const configId = process.env.CONFIG_ID || "";
    const statsCollection = configId ? `stats-${configId}` : "stats";
    const statsDoc = await db.collection(statsCollection).doc("global").get();
    const rawStats = statsDoc.exists ? statsDoc.data() : {};
    const stats = unflatten(rawStats);

    stats.total = stats.total || 0;
    stats.providers = stats.providers || {};
    stats.models = stats.models || {};
    stats.status = stats.status || {};
    stats.history = stats.history || {};

    const config = await loadConfig();
    
    const totalKeys = config.extensionKeys?.length || 0;
    const activeKeys = config.extensionKeys?.filter(k => k.active)?.length || 0;
    
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const activeToday = config.extensionKeys?.filter(k => k.lastUsedAt && k.lastUsedAt > last24h).length || 0;

    const tpSnap = await db.collection("teepublicUsers").get();
    let tpTotal = 0, tpActivePro = 0, tpActiveTrial = 0;
    const now = new Date();
    tpSnap.forEach(doc => {
      tpTotal++;
      const data = doc.data();
      const expiry = data.subscriptionExpiry ? new Date(data.subscriptionExpiry) : null;
      if (expiry && expiry > now) {
        if (data.isTrial) tpActiveTrial++;
        else tpActivePro++;
      }
    });

    const skSnap = await db.collection("users").get();
    let skTotal = 0, skActivePro = 0, skActiveTrial = 0;
    skSnap.forEach(doc => {
      skTotal++;
      const data = doc.data();
      const expiry = data.subscriptionExpiry ? new Date(data.subscriptionExpiry) : null;
      if (expiry && expiry > now) {
        if (data.isTrial) skActiveTrial++;
        else skActivePro++;
      }
    });

    return json(200, { 
      ok: true, 
      stats,
      users: {
        total: totalKeys,
        active: activeKeys,
        onlineToday: activeToday,
        teepublic: { total: tpTotal, activePro: tpActivePro, activeTrial: tpActiveTrial },
        smartkeyword: { total: skTotal, activePro: skActivePro, activeTrial: skActiveTrial }
      }
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      ok: false,
      error: { code: "STATS_ERROR", message: error.message }
    });
  }
}
