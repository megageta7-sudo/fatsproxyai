import { readFile } from "node:fs/promises";
import { callXKiro } from "./src/providers.mjs";

const apiKey = "sk-xt-ed319e809668248dd5338fbf7a0e16f5f656196678dcd2b9";

async function compareMinistral() {
  const imgBuffer = await readFile("public/airish.jpg");
  const base64 = imgBuffer.toString("base64");
  const image = { mime: "image/jpeg", base64: base64 };

  const models = ["mistralai/ministral-8b", "mistralai/ministral-3b"];

  for (const m of models) {
    console.log(`\nTesting Vision on ${m}...`);
    try {
      const start = Date.now();
      const res = await callXKiro({
        key: apiKey,
        model: m,
        image: image,
        prompt: "Describe this image in 1 sentence."
      });
      console.log(`✓ ${m} (${Date.now() - start}ms): ${res.result}`);
    } catch (e) {
      console.log(`✗ ${m}: ${e.message}`);
    }
  }
}

compareMinistral();
