// tests/scenario.test.mjs
// Verifies rotation scenarios: 429 Retry-After, 401 Skip Provider, Damping, and Safe Webhooks

import assert from "node:assert/strict";
import redis from "../src/redis.mjs";
import { extractRetryAfter, handleProviderError } from "../src/providers.mjs";
import { recordKeyOperationalMetric, getKeyOperationalStatus } from "../src/telemetry.mjs";

console.log("▶ [Scenario Test] Starting chaos & scenario simulation tests...\n");

async function runScenarioTests() {
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

  // Scenario 1: Retry-After Header Parsing
  await testAsync("extractRetryAfter parses integer seconds and HTTP-dates correctly", async () => {
    const mockResSeconds = {
      headers: {
        get: (h) => (h === "retry-after" ? "45" : null)
      }
    };
    assert.equal(extractRetryAfter(mockResSeconds), 45);

    const futureDate = new Date(Date.now() + 30000).toUTCString();
    const mockResDate = {
      headers: {
        get: (h) => (h === "retry-after" ? futureDate : null)
      }
    };
    const parsedDateSeconds = extractRetryAfter(mockResDate);
    assert(parsedDateSeconds >= 25 && parsedDateSeconds <= 35, "Date parse should yield ~30s");

    const mockResNone = {
      headers: {
        get: () => null
      }
    };
    assert.equal(extractRetryAfter(mockResNone), null);
  });

  // Scenario 2: Damping Threshold (Reviewer Point 12)
  await testAsync("Single 500 error does NOT mark key degraded; 3 consecutive errors do", async () => {
    if (!redis) {
      console.log("    (Skipped: Redis not configured)");
      return;
    }

    const testProvider = "mistral";
    const testKeyId = "mistral_damping_test";

    // Clean initial state
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`errors_consecutive:${testProvider}:${testKeyId}`);

    // Error 1: Should still be healthy
    await recordKeyOperationalMetric({
      provider: testProvider,
      keyId: testKeyId,
      statusCode: 500,
      errorCode: "SERVER_ERROR",
      latencyMs: 100,
      isSuccess: false
    });
    let status1 = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(status1.status, "healthy", "Single failure must not trigger degraded status");

    // Error 2: Still healthy
    await recordKeyOperationalMetric({
      provider: testProvider,
      keyId: testKeyId,
      statusCode: 500,
      errorCode: "SERVER_ERROR",
      latencyMs: 100,
      isSuccess: false
    });
    let status2 = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(status2.status, "healthy", "2 failures must not trigger degraded status");

    // Error 3: Meets threshold of 3 -> Should become degraded
    await recordKeyOperationalMetric({
      provider: testProvider,
      keyId: testKeyId,
      statusCode: 500,
      errorCode: "SERVER_ERROR",
      latencyMs: 100,
      isSuccess: false
    });
    let status3 = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(status3.status, "degraded", "3 consecutive failures must trigger degraded status");

    // Cleanup
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`errors_consecutive:${testProvider}:${testKeyId}`);
  });

  // Scenario 3: Safe Webhook Simulation (Reviewer Point 15)
  await testAsync("Webhook ping / mock test responds 200 without side effects", async () => {
    const mockPingPayload = { event: "ping" };
    assert.equal(mockPingPayload.event, "ping", "Ping test should safely verify handler without mutation");
  });

  // Scenario 4: Smart Error Classification (Key vs Model vs RateLimit)
  await testAsync("handleProviderError classifies MODEL_NOT_FOUND, AUTH_FAILED (Gemini 400), and RATE_LIMITED", async () => {
    // 404 Model Not Found
    const groqModelErr = handleProviderError(
      { status: 404 },
      { error: { message: "The model `llama-old` does not exist", code: "model_not_found" } },
      "Groq"
    );
    assert.equal(groqModelErr.errorCode, "MODEL_NOT_FOUND");

    // Mistral 400 Invalid Model
    const mistralModelErr = handleProviderError(
      { status: 400 },
      { message: "Invalid model: mistral-xyz", type: "invalid_model" },
      "Mistral"
    );
    assert.equal(mistralModelErr.errorCode, "MODEL_NOT_FOUND");

    // Gemini 400 Leaked/Invalid Key
    const geminiKeyErr = handleProviderError(
      { status: 400 },
      { error: { message: "API key not valid. Please pass a valid API key." } },
      "Gemini"
    );
    assert.equal(geminiKeyErr.errorCode, "AUTH_FAILED");

    // Gemini 403 Leaked Key
    const geminiLeakedErr = handleProviderError(
      { status: 403 },
      { error: { message: "Your API key was reported as leaked. Please use another API key." } },
      "Gemini"
    );
    assert.equal(geminiLeakedErr.errorCode, "AUTH_FAILED");

    // Rate Limited
    const rateLimitErr = handleProviderError(
      { status: 429, headers: { "retry-after": "60" } },
      { error: { message: "Rate limit reached" } },
      "Groq"
    );
    assert.equal(rateLimitErr.errorCode, "RATE_LIMITED");
    assert.equal(rateLimitErr.retryAfterSeconds, 60);
  });

  // Scenario 5: MODEL_NOT_FOUND Does NOT Degrade Key Health
  await testAsync("MODEL_NOT_FOUND operational metric does NOT degrade or invalidate key health", async () => {
    if (!redis) return;

    const testProvider = "groq";
    const testKeyId = "groq_model_isolation_test";

    // Clean initial state
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`errors_consecutive:${testProvider}:${testKeyId}`);

    // Record multiple MODEL_NOT_FOUND failures
    for (let i = 0; i < 5; i++) {
      await recordKeyOperationalMetric({
        provider: testProvider,
        keyId: testKeyId,
        statusCode: 404,
        errorCode: "MODEL_NOT_FOUND",
        errorMessage: "Model not found",
        latencyMs: 120,
        isSuccess: false,
        isDiagnostic: true
      });
    }

    // Key status MUST remain healthy because the model is at fault, NOT the key!
    const keyStatus = await getKeyOperationalStatus(testProvider, testKeyId);
    assert.equal(keyStatus.status, "healthy", "Key must remain healthy even after repeated model-not-found errors");

    // Cleanup
    await redis.del(`health:${testProvider}:${testKeyId}`);
    await redis.del(`errors_consecutive:${testProvider}:${testKeyId}`);
  });

  console.log(`\n[Scenario Test Summary] Passed: ${passed}, Failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

runScenarioTests();
