import { db } from "../src/firebase.mjs";
import { json, optionsResponse, vercelHandler } from "../src/http.mjs";
import { supabase, isSupabaseConfigured } from "../src/supabase.mjs";

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const params = event.queryStringParameters || {};
    const limit = Math.min(Math.max(1, parseInt(params.limit || "50")), 200);
    const provider = params.provider;
    const status = params.status; // 'success' | 'error' | number
    const requestId = params.requestId;

    // ─── Query single request attempts if requestId specified ───
    if (requestId && isSupabaseConfigured && supabase) {
      const { data: attempts, error: attErr } = await supabase
        .from("api_attempts")
        .select("*")
        .eq("request_id", requestId)
        .order("attempt_number", { ascending: true });

      if (!attErr && attempts) {
        return json(200, { ok: true, requestId, attempts });
      }
    }

    // ─── Query Supabase api_requests ───
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from("api_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (provider) {
          query = query.eq("final_provider", provider);
        }

        if (status === "success") {
          query = query.gte("status_code", 200).lt("status_code", 300);
        } else if (status === "error") {
          query = query.gte("status_code", 400);
        } else if (!isNaN(Number(status))) {
          query = query.eq("status_code", Number(status));
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const logs = data.map(r => ({
            id: r.id,
            requestId: r.request_id,
            time: r.created_at,
            method: r.method,
            path: r.endpoint,
            status: r.status_code,
            provider: r.final_provider,
            model: r.final_model,
            keyId: r.final_key_id,
            keyPreview: r.final_key_preview,
            latencyMs: r.total_latency_ms,
            attemptsCount: r.attempts_count,
            message: r.error_message || `Success (${r.total_latency_ms}ms)`,
            error: r.status_code >= 400
          }));

          return json(200, { ok: true, source: "supabase", logs });
        }
      } catch (sbErr) {
        console.warn("[Logs API] Supabase query failed, fallback to Firestore:", sbErr.message);
      }
    }

    // ─── Fallback to Firestore legacy logs ───
    const configId = process.env.CONFIG_ID || "";
    const logsCollection = configId ? `logs-${configId}` : "logs";
    const snapshot = await db.collection(logsCollection)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        time: data.timestamp ? data.timestamp.toDate().toISOString() : data.time
      };
    });

    return json(200, { ok: true, source: "firestore_legacy", logs });
  } catch (err) {
    console.error("[Proxy] Logs Error:", err.message);
    return json(500, { ok: false, error: err.message });
  }
}

export default vercelHandler(handler);
