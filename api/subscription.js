import { json, optionsResponse, readJson, vercelHandler } from "../src/http.mjs";
import { extendSubscription } from "../src/auth.mjs";
import { recordLog } from "../src/store.mjs";
import { db } from "../src/firebase.mjs";

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  const body = readJson(event);

  // === 1. START TRIAL LOGIC (TeePublic / Smart Keywords) ===
  // Use body.action to route since Vercel rewrites may alter event.path
  if (body.action === "start-trial") {
    try {
      const { email, deviceHash, appSource } = body;
      if (!email || !deviceHash) return json(400, { ok: false, message: "Email and deviceHash required" });
      if (!db) return json(500, { ok: false, message: "Database not initialized" });

      const configId = process.env.CONFIG_ID || "";
      const baseCollection = appSource === 'teepublic-metadata-ext' ? 'teepublicUsers' : 'users';
      const devicesCollection = configId ? `device_trials-${configId}` : "device_trials";
      const usersCollection = configId ? `${baseCollection}-${configId}` : baseCollection;

      const deviceRef = db.collection(devicesCollection).doc(deviceHash);
      const deviceDoc = await deviceRef.get();
      if (deviceDoc.exists) return json(403, { ok: false, message: "Free trial already used on this device", code: "TRIAL_USED" });

      const userRef = db.collection(usersCollection).doc(email);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.isTrial) return json(403, { ok: false, message: "User already claimed a free trial", code: "TRIAL_USED_USER" });
        if (userData.subscriptionExpiry && new Date(userData.subscriptionExpiry) > new Date()) {
          return json(400, { ok: false, message: "User already has an active subscription", code: "ACTIVE_SUB" });
        }
      }

      await extendSubscription(email, 1, baseCollection);
      await userRef.set({ isTrial: true }, { merge: true });
      await deviceRef.set({ email, claimedAt: new Date().toISOString() });

      return json(200, { ok: true, message: "1-Day Free Trial activated successfully", isTrial: true });
    } catch (e) {
      return json(500, { ok: false, message: e.message });
    }
  }

  // === 1.5 CHECK FLOW DOWNLOADER LIFETIME LICENSE ===
  if (body.action === "check-flow-license") {
    try {
      const { username, email } = body;
      if (!username && !email) return json(400, { ok: false, message: "Username or email is required" });
      if (!db) return json(500, { ok: false, message: "Database not initialized" });
      
      const configId = process.env.CONFIG_ID || "";
      const col = configId ? `flowUsers-${configId}` : "flowUsers";

      let isLifetime = false;
      let userData = null;

      // Prioritas 1: Cek dokumen berdasarkan Username (flowUsers/Condor-9DB1)
      if (username) {
        const uDoc = await db.collection(col).doc(username.trim()).get();
        if (uDoc.exists && uDoc.data()?.isLifetime === true) {
          isLifetime = true;
          userData = uDoc.data();
        }
      }

      // Prioritas 2: Cek dokumen berdasarkan Email jika username dicari via email
      if (!isLifetime && email) {
        const eDoc = await db.collection(col).doc(email.trim()).get();
        if (eDoc.exists && eDoc.data()?.isLifetime === true) {
          isLifetime = true;
          userData = eDoc.data();
        }
      }

      return json(200, { 
        ok: true, 
        isLifetime, 
        data: userData 
      });
    } catch (e) {
      return json(500, { ok: false, message: e.message });
    }
  }

  // === 2. WEBHOOK LYNKID LOGIC ===
  try {
    if (body.event === "ping" || body.event === "test") {
      return json(200, { ok: true, message: "Ping received" });
    }

    const customerName = (body.data?.message_data?.customer?.name || "").trim();
    const email = body.data?.message_data?.customer?.email || body.user_email || body.email;
    const status = body.data?.message_action || body.status || body.transaction_status;
    const eventType = body.event;
    
    const items = body.data?.message_data?.items || [];
    const productUuid = items[0]?.uuid || "";
    const expectedUuid = "69f8bc383494a38805ddad8f-3584-3961659950-1777908792574"; // Smart Keywords Pro

    // TeePublic Pro UUIDs
    const teepubUuid1M = "6a3526bc6109cf15b28bd7fd-5891-2675146577-1781868220768";
    const teepubUuid2M = "6a353b0c284713f214fa849f-6414-1730376308-1781873420229";
    const teepubUuid3M = "6a353b2b3fc9d87072a35796-1249-2799753855-1781873451171";

    // Flow Downloader Lifetime UUID (Rp 15.000)
    const flowDownloaderUuid = "6a1d8dfc07ee2f471eb120c2-3963-3104899899-1780321788660";

    let targetCollection = "users";
    let daysToAdd = 30;
    let isFlowDownloader = false;

    if (productUuid === flowDownloaderUuid) {
        targetCollection = "flowUsers";
        daysToAdd = 36500; // 100 Tahun (Lifetime)
        isFlowDownloader = true;
    } else if (productUuid === expectedUuid) {
        targetCollection = "users";
        daysToAdd = 30;
    } else if (productUuid === teepubUuid1M) {
        targetCollection = "teepublicUsers";
        daysToAdd = 30;
    } else if (productUuid === teepubUuid2M) {
        targetCollection = "teepublicUsers";
        daysToAdd = 60;
    } else if (productUuid === teepubUuid3M) {
        targetCollection = "teepublicUsers";
        daysToAdd = 90;
    } else if (eventType === "payment.received") {
        return json(200, { ok: true, message: "Ignored (invalid product UUID)" });
    }

    const isSuccess = ["success", "paid", "settlement", "completed"].includes(String(status).toLowerCase());
    if (!isSuccess && eventType !== "payment.received") return json(200, { ok: true, message: "Ignored (not success)" });

    let result = null;
    const configId = process.env.CONFIG_ID || "";
    const usersCollection = configId ? `${targetCollection}-${configId}` : targetCollection;

    if (isFlowDownloader) {
        const expiryDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
        
        // 1 DOKUMEN TUNGGAL PER TRANSAKSI:
        // Jika ada Username di kolom nama -> ID Dokumen = Username (Langsung Aktif Otomatis)
        // Jika pembeli lupa/salah isi nama -> ID Dokumen = Email Pembeli (Tercatat untuk dicek Admin)
        const hasUsername = Boolean(customerName && customerName.length >= 3);
        const docId = hasUsername ? customerName : email;

        if (!docId) {
            console.warn("[Flow Downloader Webhook] No customer name or email found.");
            return json(400, { ok: false, message: "No customer name or email found" });
        }

        const flowUserData = {
            isLifetime: true,
            username: hasUsername ? customerName : "",
            customerName: customerName || "",
            email: email || "",
            subscriptionExpiry: expiryDate,
            activatedAt: new Date().toISOString(),
            productUuid: flowDownloaderUuid,
            autoVerified: hasUsername,
            needsManualClaim: !hasUsername
        };

        if (db) {
            await db.collection(usersCollection).doc(docId).set(flowUserData, { merge: true });
        }
        result = flowUserData;
        await recordLog({ 
            method: "WEBHOOK", 
            path: "/api/webhook-lynkid", 
            status: 200, 
            host: "Lynk.id", 
            message: hasUsername 
                ? `Lifetime auto-activated for username: ${customerName}` 
                : `Payment recorded for email: ${email} (Manual claim required)` 
        });
    } else {
        if (!email && eventType === "payment.received") return json(400, { ok: false, message: "No email found" });
        if (!email) return json(200, { ok: true, message: "Event ignored" });

        result = await extendSubscription(email, daysToAdd, targetCollection);
        // Remove the trial flag since they actually paid
        if (db) {
            await db.collection(usersCollection).doc(email).set({ isTrial: false }, { merge: true });
        }
        await recordLog({ method: "WEBHOOK", path: "/api/webhook-lynkid", status: 200, host: "Lynk.id", message: `Subscription extended for ${email} (+${daysToAdd} days)` });
    }

    return json(200, { ok: true, message: `Subscription extended successfully (+${daysToAdd} days)`, data: result });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return json(500, { ok: false, error: { code: "WEBHOOK_ERROR", message: error.message } });
  }
}

export default vercelHandler(handler);
