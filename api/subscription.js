const PRIVACY_HTML = "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Kebijakan Privasi - Flow Mass Downloader</title>\n    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n    <link href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap\" rel=\"stylesheet\">\n    <style>\n        :root {\n            --bg-base: #090a0f;\n            --card-bg: rgba(17, 21, 33, 0.85);\n            --card-border: rgba(255, 255, 255, 0.08);\n            --text-main: #f8fafc;\n            --text-muted: #94a3b8;\n            --text-dim: #64748b;\n            --accent-cyan: #38bdf8;\n            --accent-indigo: #6366f1;\n            --accent-violet: #a855f7;\n            --accent-emerald: #10b981;\n        }\n        * { margin: 0; padding: 0; box-sizing: border-box; }\n        body {\n            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;\n            background-color: var(--bg-base);\n            color: var(--text-main);\n            min-height: 100vh;\n            line-height: 1.8;\n            padding: 40px 20px 80px;\n            position: relative;\n            overflow-x: hidden;\n        }\n        .container { max-width: 840px; margin: 0 auto; position: relative; z-index: 1; }\n        .header { text-align: center; margin-bottom: 40px; }\n        .badge {\n            display: inline-flex;\n            align-items: center;\n            gap: 8px;\n            padding: 6px 14px;\n            background: rgba(56, 189, 248, 0.1);\n            border: 1px solid rgba(56, 189, 248, 0.25);\n            border-radius: 999px;\n            font-size: 0.82rem;\n            font-weight: 700;\n            color: var(--accent-cyan);\n            margin-bottom: 16px;\n        }\n        .header h1 {\n            font-size: 2.2rem;\n            font-weight: 800;\n            background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #94a3b8 100%);\n            -webkit-background-clip: text;\n            -webkit-text-fill-color: transparent;\n            margin-bottom: 8px;\n        }\n        .effective-date { color: var(--text-dim); font-size: 0.9rem; }\n        .content-card {\n            background: var(--card-bg);\n            border: 1px solid var(--card-border);\n            border-radius: 20px;\n            padding: 36px;\n            backdrop-filter: blur(20px);\n            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);\n            display: flex;\n            flex-direction: column;\n            gap: 28px;\n        }\n        .section { border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 20px; }\n        .section:last-child { border-bottom: none; padding-bottom: 0; }\n        h2 { font-size: 1.25rem; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; }\n        p { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 12px; }\n        ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }\n        li { color: var(--text-muted); font-size: 0.92rem; padding-left: 20px; position: relative; }\n        li::before { content: \"•\"; color: var(--accent-cyan); font-weight: bold; position: absolute; left: 4px; }\n        .highlight-box {\n            background: rgba(16, 185, 129, 0.08);\n            border: 1px solid rgba(16, 185, 129, 0.2);\n            border-radius: 12px;\n            padding: 16px 20px;\n            margin-top: 10px;\n        }\n        .highlight-box p { color: #a7f3d0; margin-bottom: 0; }\n        .footer { text-align: center; margin-top: 40px; color: var(--text-dim); font-size: 0.85rem; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <div class=\"header\">\n            <div class=\"badge\">🛡️ Kebijakan Privasi Resmi (Privacy Policy)</div>\n            <h1>Flow Mass Downloader</h1>\n            <div class=\"effective-date\">Berlaku Mulai: 30 Agustus 2026 • Versi 1.2</div>\n        </div>\n\n        <div class=\"content-card\">\n            <div class=\"section\">\n                <h2>1. Pendahuluan</h2>\n                <p>Flow Mass Downloader (\"kami\", \"ekstensi\", atau \"aplikasi\") berkomitmen penuh untuk menghormati dan melindungi privasi serta keamanan data setiap pengguna. Kebijakan Privasi ini menjelaskan bagaimana data dan informasi Anda dikelola saat menggunakan ekstensi Chrome Flow Mass Downloader.</p>\n            </div>\n\n            <div class=\"section\">\n                <h2>2. Data yang Dikumpulkan & Tujuannya</h2>\n                <p>Ekstensi kami dirancang dengan prinsip Privacy-First dan Data Minimization. Kami hanya mengumpulkan data yang mutlak diperlukan untuk mengoperasikan fitur ekstensi:</p>\n                <ul>\n                    <li><b>Informasi Akun Google (Email & Nama Profil):</b> Diambil saat Anda melakukan Login dengan Google untuk memverifikasi masa aktif Free Trial (2 Hari) dan lisensi Lifetime Pro Anda.</li>\n                    <li><b>Preferensi Unduhan Lokal:</b> Pilihan resolusi (1K/2K/4K), nama subfolder tujuan, pengaturan delay timer, dan bahasa antarmuka disimpan secara lokal di browser Anda menggunakan <code>chrome.storage.local</code>.</li>\n                    <li><b>Konten Media:</b> Ekstensi hanya membaca elemen gambar/video yang tampil di tab aktif Google Labs Flow (<code>labs.google</code>) atas perintah klik Anda untuk memulai unduhan.</li>\n                </ul>\n            </div>\n\n            <div class=\"section\">\n                <h2>3. Izin Ekstensi Chrome (Permissions)</h2>\n                <ul>\n                    <li><code>downloads</code>: Digunakan untuk memicu penyimpanan berkas media yang dihasilkan ke folder komputer lokal Anda.</li>\n                    <li><code>storage</code>: Digunakan untuk menyimpan preferensi pengguna (resolusi, folder, delay) secara lokal pada perangkat Anda.</li>\n                    <li><code>identity</code>: Digunakan untuk memfasilitasi autentikasi Google Sign-In secara aman.</li>\n                    <li><code>host_permissions (labs.google)</code>: Digunakan untuk berinteraksi dengan antarmuka web Google Labs Flow guna mendeteksi media dan memicu proses unduhan.</li>\n                </ul>\n            </div>\n\n            <div class=\"section\">\n                <h2>4. Perlindungan & Larangan Penjualan Data</h2>\n                <div class=\"highlight-box\">\n                    <p><b>Jaminan Keamanan:</b> Kami <b>TIDAK PERNAH</b> menjual, menyewakan, meminjamkan, atau membagikan informasi pribadi atau data penggunaan Anda kepada pihak ketiga, pengiklan, atau broker data mana pun.</p>\n                </div>\n            </div>\n\n            <div class=\"section\">\n                <h2>5. Pembayaran & Lisensi</h2>\n                <p>Transaksi pembelian Lisensi Lifetime diproses secara aman melalui platform pembayaran resmi pihak ketiga (Lynk.id / QRIS). Kami tidak menyimpan informasi kartu kredit atau detail perbankan Anda di server kami.</p>\n            </div>\n\n            <div class=\"section\">\n                <h2>6. Kontak Kami</h2>\n                <p>Email Dukungan: <code style=\"color: var(--accent-cyan);\">aronisme@gmail.com</code></p>\n            </div>\n        </div>\n\n        <div class=\"footer\">\n            © 2026 Flow Mass Downloader. Dikembangkan oleh Aron Muhammad. Semua hak dilindungi undang-undang.\n        </div>\n    </div>\n</body>\n</html>";

﻿import { json, optionsResponse, readJson, vercelHandler } from "../src/http.mjs";
import { extendSubscription } from "../src/auth.mjs";
import { recordLog } from "../src/store.mjs";
import { db } from "../src/firebase.mjs";

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "s-maxage=86400, stale-while-revalidate"
      },
      body: PRIVACY_HTML
    };
  }
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
          const saveCols = ["flowUsers"];
          if (configId && configId !== "flowUsers") saveCols.push(`flowUsers-${configId}`);
          for (const col of saveCols) {
            await db.collection(col).doc(cleanEmail).set(userData, { merge: true });
          }
          if (isDev) isLifetime = true;
        } catch (e) {
          console.error("[flowUsers auto-register error]", e);
        }
      } else if (userData && email) {
        try {
          const saveCols = ["flowUsers"];
          if (configId && configId !== "flowUsers") saveCols.push(`flowUsers-${configId}`);
          for (const col of saveCols) {
            await db.collection(col).doc(email.toLowerCase().trim()).set({
              lastLoginAt: new Date().toISOString(),
              displayName: body.displayName || userData.displayName || "",
              photoURL: body.photoURL || userData.photoURL || ""
            }, { merge: true });
          }
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
