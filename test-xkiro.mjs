import { callXKiro } from "./src/providers.mjs";

const apiKey = process.env.XKIRO_KEY || "sk-xt-ed319e809668248dd5338fbf7a0e16f5f656196678dcd2b9";
const model = process.env.XKIRO_MODEL || "mistralai/ministral-14b";

async function test() {
  console.log(`\nTesting xKiro with Model: ${model}...`);
  try {
    const startTime = Date.now();
    const response = await callXKiro({
      key: apiKey,
      model: model,
      prompt: "Halo! Berikan respons singkat konfirmasi bahwa model mistralai/ministral-14b aktif di xKiro."
    });
    const duration = Date.now() - startTime;

    console.log(`\n✓ SUCCESS (${duration}ms):`);
    console.log("-----------------------------------------");
    console.log(response.result);
    console.log("-----------------------------------------");
    if (response.usage) {
      console.log("Usage stats:", response.usage);
    }
  } catch (error) {
    console.error(`\n✗ FAILED (Status: ${error.statusCode || "N/A"}):`);
    console.error(error.message);
  }
}

test();
