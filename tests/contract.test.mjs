// tests/contract.test.mjs
// Verifies that the API proxy contract is 100% backward compatible with existing Chrome extensions

import assert from "node:assert/strict";
import { normalizeMetadata } from "../src/normalize.mjs";

console.log("▶ [Contract Test] Starting contract & backward-compatibility tests...\n");

async function runContractTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${e.message}`);
      failed++;
    }
  }

  // 1. Contract Test: normalizeMetadata structured output
  test("normalizeMetadata returns all expected legacy fields", () => {
    const rawAiOutput = JSON.stringify({
      title: "Majestic Mountain Peak at Sunset",
      keywords: ["mountain", "sunset", "nature", "landscape", "clouds", "sky"],
      category: "landscape",
      peopleOrProperty: false,
      fileTypeFlag: false
    });

    const result = normalizeMetadata(rawAiOutput, { keywordCount: 30 });

    // Assert essential contract fields expected by Smart Keywords extension
    assert.equal(typeof result.result, "string", "result string required");
    assert.equal(typeof result.title, "string", "title string required");
    assert(Array.isArray(result.keywords), "keywords array required");
    assert.equal(typeof result.category, "string", "category required");
    assert.equal(typeof result.legacyResult, "string", "legacyResult required");
    assert.equal(typeof result.peopleOrProperty, "boolean", "peopleOrProperty boolean required");
    assert.equal(typeof result.fileTypeFlag, "boolean", "fileTypeFlag boolean required");

    // Assert legacy format exact structure: title&&keywords&&category&&peopleOrProperty&&fileTypeFlag
    const parts = result.legacyResult.split("&&");
    assert.equal(parts.length, 5, "legacyResult must have exactly 5 parts delimited by &&");
    assert.equal(parts[0], "Majestic Mountain Peak at Sunset");
    assert.equal(parts[2], "landscape");
    assert.equal(parts[3], "false");
    assert.equal(parts[4], "false");
  });

  // 2. Contract Test: normalizeMetadata fallback for plaintext response
  test("normalizeMetadata handles plain text fallback with TITLE & KEYWORDS labels", () => {
    const plainText = `TITLE: Golden Desert Dunes Under Blue Sky
KEYWORDS: desert, sand, dunes, golden, sunny, travel, africa
CATEGORY: travel
FILE_TYPE: Photo`;

    const result = normalizeMetadata(plainText, { keywordCount: 20 });
    assert.equal(result.title, "Golden Desert Dunes Under Blue Sky");
    assert(result.keywords.includes("desert"));
    assert(result.keywords.includes("sand"));
    assert.equal(result.category, "travel");
    assert.equal(result.fileTypeFlag, false);
    assert(result.legacyResult.includes("Golden Desert Dunes"));
  });

  // 3. Contract Test: Keyword count limit & sanitization
  test("normalizeMetadata respects keywordCount and strips markdown bullets", () => {
    const rawAi = JSON.stringify({
      title: "Cyberpunk City Skyline at Night",
      keywords: ["*city*", "**neon**", "1. cyberpunk", "#lights", "future", "night"],
      category: "technology"
    });

    const result = normalizeMetadata(rawAi, { keywordCount: 3 });
    assert.equal(result.keywords.length, 3, "Must respect keyword count limit");
    assert.equal(result.keywords[0], "city", "Must strip leading/trailing asterisks");
    assert.equal(result.keywords[1], "neon", "Must strip bold formatting");
    assert.equal(result.keywords[2], "cyberpunk", "Must strip leading bullet number");
  });

  console.log(`\n[Contract Test Summary] Passed: ${passed}, Failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

runContractTests();
