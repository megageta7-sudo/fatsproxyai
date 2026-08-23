import { callXKiro } from "./src/providers.mjs";
import { loadConfig } from "./src/store.mjs";

console.log("Checking xkiro provider integration...");

// Check providers export
if (typeof callXKiro === "function") {
  console.log("✓ callXKiro is exported properly");
} else {
  console.error("✗ callXKiro is not a function");
}

// Check store config loading
try {
  const config = await loadConfig();
  if (config.xkiro && config.providerOrder.includes("xkiro")) {
    console.log("✓ xkiro config and providerOrder loaded successfully:", {
      model: config.xkiro.model,
      providerOrder: config.providerOrder
    });
  } else {
    console.error("✗ xkiro missing in config:", config);
  }
} catch (e) {
  console.log("Config load info (Firestore or Local):", e.message);
}

console.log("Verification finished.");
