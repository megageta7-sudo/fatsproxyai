// tests/integration.test.mjs
// Verifies Redis operational state, Supabase client, and Firestore config normalization

import assert from "node:assert/strict";
import redis from "../src/redis.mjs";
import { normalizeProviderKeys, getRawKey, loadConfig } from "../src/store.mjs";
import { isSupabaseConfigured, supabase } from "../src/supabase.mjs";
import { recordKeyOperationalMetric, getKeyOperationalStatus, getActiveAlerts } from "../src/telemetry.mjs";

console.log("▶ [Integration Test] Starting infrastructure & operational tests...\n");

async function runIntegrationTests() {
  let passed = 0;
  let failed = 0;

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${e.message}`);
      failed++;
    }
  }

  // 1. Stable Key Normalization Test
  await testAsync("normalizeProviderKeys generates deterministic stable key_id and preview", async () => {
    const rawKeys = ["gsk_test1234567890abcdef", "gsk_test9876543210fedcba"];
    const normalized = normalizeProviderKeys("groq", rawKeys);

    assert.equal(normalized.length, 2);
    assert(normalized[0].id.startsWith("groq_"), "id must start with provider prefix");
    assert.equal(normalized[0].preview, "gsk_te...cdef");
    assert.equal(normalized[0].active, true);
    assert.equal(getRawKey(normalized[0]), "gsk_test1234567890abcdef");

    // Re-normalizing same key must produce the exact same ID (deterministic)
    const reNormalized = normalizeProviderKeys("groq", ["gsk_test1234567890abcdef"]);
    assert.equal(reNormalized[0].id, normalized[0].id, "Stable key_id must be deterministic");
  });

  // 2. Redis Operational Health & Cooldown Test
  await testAsync("Redis operational state and cooldown tracking", async () => {
    if (!redis) {
      console.log("    (Skipped: Redis credentials not configured)");
      return;
    }

    const testProvider = "groq";
    const testKeyId = "groq_test_int_key";
    const testKeyHash = "hash123";

    // Simulate 429 rate limit with 15s retryAfter
    await recordKeyOperationalMetric({
      provider: testProvider,
      keyId: testKeyId,
      keyHash: testKeyHash,
      keyPreview: "gsk_te...test",
      statusCode: 429,
      errorCode: "RATE_LIMITED",
      latencyMs: 350,
      errorMessage: "Rate limit exceeded",
      isSuccess: false,
      retryAfterSeconds: 15,
      isDiagnostic: false
    });

    const opStatus = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(opStatus.status, "rate_limited");
    assert(opStatus.cooldownRemaining > 0, "cooldownRemaining must be > 0");

    // Clean up test keys
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`cooldown:${testProvider}:${testKeyId}`);
  });

  // 3. Diagnostic Isolation Test (Reviewer Point 13 — refined)
  // Diagnostic tests now write health status but skip production cooldown timers.
  // A single diagnostic 500 error still respects damping (threshold=3), so status stays healthy.
  await testAsync("Diagnostic test writes health data but respects damping threshold", async () => {
    if (!redis) return;

    const testProvider = "gemini";
    const testKeyId = "gemini_diag_test";

    // Clean initial state
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`errors_consecutive:${testProvider}:${testKeyId}`);
    await redis.del(`cooldown:${testProvider}:${testKeyId}`);

    // Single diagnostic failure: damping threshold requires 3, so 1 error = still healthy
    await recordKeyOperationalMetric({
      provider: testProvider,
      keyId: testKeyId,
      statusCode: 500,
      errorCode: "SERVER_ERROR",
      latencyMs: 120,
      isSuccess: false,
      isDiagnostic: true
    });

    let opStatus = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(opStatus.status, "healthy", "1 diagnostic error must stay healthy (damping threshold=3)");

    // But a 401 diagnostic failure SHOULD immediately mark as invalid (no damping needed)
    await recordKeyOperationalMetric({
      provider: testProvider,
      keyId: testKeyId,
      statusCode: 401,
      errorCode: "AUTH_FAILED",
      latencyMs: 80,
      isSuccess: false,
      isDiagnostic: true
    });

    opStatus = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(opStatus.status, "invalid", "401 diagnostic error must immediately mark invalid");

    // Verify diagnostic did NOT write a cooldown timer (production-safe)
    const cooldownVal = await redis.get(`cooldown:${testProvider}:${testKeyId}`);
    assert.equal(cooldownVal, null, "Diagnostic must not set production cooldown timer");

    // Cleanup
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`errors_consecutive:${testProvider}:${testKeyId}`);
    await redis.del(`cooldown:${testProvider}:${testKeyId}`);
    // Clean up alert set entries
    const alertIds = await redis.smembers("alerts:active_set");
    const diagAlerts = alertIds.filter(id => id.includes(testKeyId));
    if (diagAlerts.length > 0) {
      await redis.srem("alerts:active_set", ...diagAlerts);
      await Promise.all(diagAlerts.map(id => redis.del(`alert_data:${id}`)));
    }
  });

  // 4. Supabase Client State Test
  await testAsync("Supabase client exports valid structure", async () => {
    assert.equal(typeof isSupabaseConfigured, "boolean");
    if (isSupabaseConfigured) {
      assert(supabase !== null, "supabase client must be initialized");
    }
  });

  console.log(`\n[Integration Test Summary] Passed: ${passed}, Failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

runIntegrationTests();
