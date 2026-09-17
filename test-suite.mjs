// test-suite.mjs
// Master Test Runner for AI Proxy V2 (Vercel Edition)
// Executes Contract, Integration, and Scenario test suites

import { spawn } from "node:child_process";
import path from "node:path";

console.log("================================================================");
console.log(" 🧪 MEGA VERCEL AI PROXY - AUTOMATED TEST RUNNER");
console.log("================================================================\n");

const suites = [
  { name: "Contract & Backward Compatibility", path: "./tests/contract.test.mjs" },
  { name: "Infrastructure & Redis Integration", path: "./tests/integration.test.mjs" },
  { name: "Scenario, Chaos & Damping Tests", path: "./tests/scenario.test.mjs" }
];

async function runSuite(suite) {
  return new Promise((resolve) => {
    console.log(`----------------------------------------------------------------`);
    console.log(`▶ Running Suite: ${suite.name}`);
    console.log(`----------------------------------------------------------------`);

    const child = spawn(process.execPath, ["--env-file=.env", suite.path], {
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve({ name: suite.name, code });
    });
  });
}

async function runAll() {
  const results = [];
  const startTime = Date.now();

  for (const suite of suites) {
    const res = await runSuite(suite);
    results.push(res);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n================================================================");
  console.log(` 📊 OVERALL TEST REPORT (${duration}s)`);
  console.log("================================================================");

  let allPassed = true;
  for (const res of results) {
    const status = res.code === 0 ? "✓ PASSED" : "✗ FAILED";
    console.log(`  ${status.padEnd(10)} | ${res.name}`);
    if (res.code !== 0) allPassed = false;
  }

  console.log("================================================================");
  if (allPassed) {
    console.log("🎉 ALL SUITES PASSED! Zero breaking changes, contract intact.\n");
    process.exit(0);
  } else {
    console.error("❌ SOME TEST SUITES FAILED. Check logs above.\n");
    process.exit(1);
  }
}

runAll();
