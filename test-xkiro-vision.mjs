import { readFile } from "node:fs/promises";
import { callXKiro } from "./src/providers.mjs";
import { normalizeMetadata } from "./src/normalize.mjs";

const apiKey = process.env.XKIRO_KEY || "sk-xt-ed319e809668248dd5338fbf7a0e16f5f656196678dcd2b9";
const model = process.env.XKIRO_MODEL || "mistralai/ministral-14b";

async function testVision() {
  console.log("Reading test image (public/airish.jpg)...");
  const imgBuffer = await readFile("public/airish.jpg");
  const base64 = imgBuffer.toString("base64");
  const image = {
    mime: "image/jpeg",
    base64: base64
  };

  console.log(`\nTesting Vision on ${model}...`);
  try {
    const startTime = Date.now();
    const response = await callXKiro({
      key: apiKey,
      model: model,
      image: image,
      prompt: "Describe this image and generate JSON microstock metadata (title, keywords, category, peopleOrProperty, fileTypeFlag)."
    });
    const duration = Date.now() - startTime;

    console.log(`✓ Vision Success (${duration}ms):`);
    console.log(response.result);
  } catch (error) {
    console.error("✗ Vision error:", error.message);
  }
}

testVision();
