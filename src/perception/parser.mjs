// src/perception/parser.mjs

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const PERCEPTION_SYSTEM_PROMPT = `You are a psychological perception engine.
Analyze the user's message and return ONLY a valid JSON object with the following exact structure:
{
  "intent": "greeting" | "question" | "venting" | "sharing" | "request" | "other",
  "topic": "string (short phrase describing the main topic)",
  "emotion": "happy" | "sad" | "angry" | "anxious" | "neutral" | "excited" | "tired",
  "importance": number (0.0 to 1.0, how significant is this message to the user's life),
  "memory_candidate": boolean (true if this message contains a personal fact or event worth remembering, false otherwise)
}
DO NOT wrap the response in markdown blocks (like \`\`\`json). Return raw JSON only.`;

/**
 * Menganalisis pesan pengguna menggunakan Groq API (Sangat Cepat)
 * untuk mengekstrak emosi, intent, dan kandidat memori.
 */
export async function parseUserMessage(userMessage) {
    if (!GROQ_API_KEY) {
        console.warn("GROQ_API_KEY is not set. Menggunakan persepsi default.");
        return { intent: "other", topic: "general", emotion: "neutral", importance: 0.1, memory_candidate: false };
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "qwen/qwen3.6-27b", // Model Qwen 3.6 di Groq
                messages: [
                    { role: "system", content: PERCEPTION_SYSTEM_PROMPT },
                    { role: "user", content: userMessage }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1 // Rendah agar konsisten output JSON-nya
            })
        });

        if (!response.ok) {
            console.error("Groq Perception API Error:", await response.text());
            throw new Error("Failed to parse message via Groq");
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        console.error("Perception Parser Exception:", e);
        // Fallback aman jika Groq error/rate limit
        return { intent: "other", topic: "general", emotion: "neutral", importance: 0.1, memory_candidate: false };
    }
}
