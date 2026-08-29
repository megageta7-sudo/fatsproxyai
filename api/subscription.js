import { json, optionsResponse, readJson, vercelHandler } from "../src/http.mjs";
import { extendSubscription } from "../src/auth.mjs";
import { recordLog } from "../src/store.mjs";
import { db } from "../src/firebase.mjs";

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  let body = {};
  try {
    body = readJson(event);
  } catch (err) {
    return json(400, { ok: false, message: "Invalid JSON body" });
  }

  // === 1. START TRIAL LOGIC (TeePublic / Smart Keywords) ===
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
      const cols = ["flowUsers"];
      if (configId && configId !== "flowUsers") cols.push(`flowUsers-${configId}`);

      let isLifetime = false;
      let userData = null;

      for (const col of cols) {
        if (isLifetime) break;

        // 1. Cek langsung doc(username)
        if (username) {
          try {
            const uDoc = await db.collection(col).doc(username.trim()).get();
            if (uDoc.exists && uDoc.data()?.isLifetime === true) {
              isLifetime = true;
              userData = uDoc.data();
              break;
            }
          } catch (e) {}
        }

        // 2. Cek langsung doc(email)
        if (email) {
          try {
            const eDoc = await db.collection(col).doc(email.trim()).get();
            if (eDoc.exists && eDoc.data()?.isLifetime === true) {
              isLifetime = true;
              userData = eDoc.data();
              break;
            }
          } catch (e) {}
        }

        // 3. Cek query field username
        if (username) {
          try {
            const qSnap = await db.collection(col).where("username", "==", username.trim()).limit(1).get();
            if (!qSnap.empty && qSnap.docs[0].data()?.isLifetime === true) {
              isLifetime = true;
              userData = qSnap.docs[0].data();
              break;
            }
          } catch (e) {}
        }

        // 4. Cek query field email
        if (email) {
          try {
            const qSnap = await db.collection(col).where("email", "==", email.trim()).limit(1).get();
            if (!qSnap.empty && qSnap.docs[0].data()?.isLifetime === true) {
              isLifetime = true;
              userData = qSnap.docs[0].data();
              break;
            }
          } catch (e) {}
        }
      }

      // Jika belum ada di database, otomatis daftarkan user baru di koleksi flowUsers
      if (!userData && email) {
        const cleanEmail = email.toLowerCase().trim();
        const isDev = (cleanEmail === "aronisme@gmail.com" || cleanEmail === "sr6a@gmail.com");
        const trialStart = Date.now();
        const trialExpiry = new Date(trialStart + 2 * 24 * 60 * 60 * 1000).toISOString();
        userData = {
          email: cleanEmail,
          displayName: body.displayName || "",
          photoURL: body.photoURL || "",
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          trialStart: trialStart,
          subscriptionExpiry: isDev ? "2126-01-01T00:00:00.000Z" : trialExpiry,
          isLifetime: isDev
        };
        try {
          await db.collection("flowUsers").doc(cleanEmail).set(userData, { merge: true });
          if (isDev) isLifetime = true;
        } catch (e) {
          console.error("[flowUsers auto-register error]", e);
        }
      } else if (userData && email) {
        try {
          await db.collection("flowUsers").doc(email.toLowerCase().trim()).set({
            lastLoginAt: new Date().toISOString(),
            displayName: body.displayName || userData.displayName || "",
            photoURL: body.photoURL || userData.photoURL || ""
          }, { merge: true });
        } catch (e) {}
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

  // === 1.6 CLAIM FLOW DOWNLOADER LICENSE (Tautkan Email Pembelian ke Username Ekstensi) ===
  if (body.action === "claim-flow-license") {
    try {
      const { email, username } = body;
      if (!email || !username) return json(400, { ok: false, message: "Email dan Username diperlukan" });
      if (!db) return json(500, { ok: false, message: "Database not initialized" });

      const configId = process.env.CONFIG_ID || "";
      const cols = ["flowUsers"];
      if (configId && configId !== "flowUsers") cols.push(`flowUsers-${configId}`);

      let foundData = null;

      for (const col of cols) {
        // Cek doc(email)
        try {
          const eDoc = await db.collection(col).doc(email.trim()).get();
          if (eDoc.exists && eDoc.data()?.isLifetime === true) {
            foundData = eDoc.data();
            break;
          }
        } catch (e) {}

        // Cek field email
        try {
          const qSnap = await db.collection(col).where("email", "==", email.trim()).limit(1).get();
          if (!qSnap.empty && qSnap.docs[0].data()?.isLifetime === true) {
            foundData = qSnap.docs[0].data();
            break;
          }
        } catch (e) {}
      }

      if (!foundData) {
        return json(404, { 
          ok: false, 
          message: "Data pembelian untuk email ini belum ditemukan. Pastikan email persis sama dengan saat checkout di Lynk.id." 
        });
      }

      const updatedData = {
        ...foundData,
        isLifetime: true,
        username: username.trim(),
        claimedAt: new Date().toISOString()
      };

      for (const col of cols) {
        await db.collection(col).doc(username.trim()).set(updatedData, { merge: true });
        await db.collection(col).doc(email.trim()).set(updatedData, { merge: true });
      }

      return json(200, {
        ok: true,
        isLifetime: true,
        message: "Lisensi Lifetime Pro berhasil ditautkan ke Username Anda!",
        data: updatedData
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

    const customerName = (body.data?.message_data?.customer?.name || body.name || body.customer_name || "").trim();
    const email = (body.data?.message_data?.customer?.email || body.user_email || body.email || body.customer_email || "").trim();
    const status = body.data?.message_action || body.status || body.transaction_status || "";
    const eventType = body.event || "";
    
    const items = body.data?.message_data?.items || body.items || [];
    const productUuid = items[0]?.uuid || body.uuid || "";
    const productTitle = (items[0]?.title || body.title || "").toLowerCase();

    const expectedUuid = "69f8bc383494a38805ddad8f-3584-3961659950-1777908792574"; // Smart Keywords Pro
    const teepubUuid1M = "6a3526bc6109cf15b28bd7fd-5891-2675146577-1781868220768";
    const teepubUuid2M = "6a353b0c284713f214fa849f-6414-1730376308-1781873420229";
    const teepubUuid3M = "6a353b2b3fc9d87072a35796-1249-2799753855-1781873451171";
    const flowDownloaderUuid = "6a1d8dfc07ee2f471eb120c2-3963-3104899899-1780321788660";

    let targetCollection = "users";
    let daysToAdd = 30;
    let isFlowDownloader = false;

    // Deteksi cerdas: Cocokkan via UUID ATAU via judul produk
    if (productUuid === flowDownloaderUuid || productTitle.includes("flow downloader") || productTitle.includes("flow 2k") || productTitle.includes("flow mass")) {
        targetCollection = "flowUsers";
        daysToAdd = 36500; // 100 Tahun (Lifetime)
        isFlowDownloader = true;
    } else if (productUuid === expectedUuid || productTitle.includes("smart keywords")) {
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
    } else if (eventType === "payment.received" && !productTitle.includes("flow")) {
        return json(200, { ok: true, message: "Ignored (unrecognized product)" });
    }

    const isSuccess = ["success", "paid", "settlement", "completed"].includes(String(status).toLowerCase());
    if (!isSuccess && eventType !== "payment.received") {
      return json(200, { ok: true, message: `Ignored (status: ${status})` });
    }

    let result = null;
    const configId = process.env.CONFIG_ID || "";

    if (isFlowDownloader) {
        const expiryDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
        
        // JIKA USERNAME KOSONG -> GUNAKAN EMAIL SEBAGAI GANTI NAMA/USERNAME
        const hasUsername = Boolean(customerName && customerName.length >= 3);
        const finalUsername = hasUsername ? customerName : (email || `user_${Date.now()}`);

        const flowUserData = {
            isLifetime: true,
            username: finalUsername,
            customerName: customerName || "",
            email: email || "",
            subscriptionExpiry: expiryDate,
            activatedAt: new Date().toISOString(),
            productUuid: productUuid || flowDownloaderUuid,
            autoVerified: true
        };

        if (db) {
            const collectionsToSave = ["flowUsers"];
            if (configId && configId !== "flowUsers") {
                collectionsToSave.push(`flowUsers-${configId}`);
            }

            for (const colName of collectionsToSave) {
                // 1. Simpan dokumen dengan ID finalUsername
                if (finalUsername) {
                    await db.collection(colName).doc(finalUsername).set(flowUserData, { merge: true });
                }
                // 2. Simpan juga dokumen dengan ID email jika berbeda
                if (email && email !== finalUsername) {
                    await db.collection(colName).doc(email).set(flowUserData, { merge: true });
                }
            }
        }
        result = flowUserData;
        try {
            await recordLog({ 
                method: "WEBHOOK", 
                path: "/api/webhook-lynkid", 
                status: 200, 
                host: "Lynk.id", 
                message: `Lifetime Flow activated for: ${finalUsername} (Email: ${email})` 
            });
        } catch (e) {}
    } else {
        const usersCollection = configId ? `${targetCollection}-${configId}` : targetCollection;
        if (!email && eventType === "payment.received") return json(400, { ok: false, message: "No email found" });
        if (!email) return json(200, { ok: true, message: "Event ignored" });

        result = await extendSubscription(email, daysToAdd, targetCollection);
        if (db) {
            await db.collection(usersCollection).doc(email).set({ isTrial: false }, { merge: true });
        }
        try {
            await recordLog({ method: "WEBHOOK", path: "/api/webhook-lynkid", status: 200, host: "Lynk.id", message: `Subscription extended for ${email} (+${daysToAdd} days)` });
        } catch (e) {}
    }

    return json(200, { ok: true, message: `Subscription extended successfully (+${daysToAdd} days)`, data: result });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return json(500, { ok: false, error: { code: "WEBHOOK_ERROR", message: error.message } });
  }
}

export default vercelHandler(handler);
