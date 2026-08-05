// src/soul/reflection.mjs
import { saveEpisodicMemory } from "../memory/episodic.mjs";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const REFLECTION_PROMPT = `Kamu adalah mesin introspeksi psikologis. 
Tugasmu menganalisis transkrip percakapan ini dan mengekstrak JIKA ada fakta penting baru atau kejadian spesifik tentang user.
Output harus format JSON murni:
{
  "new_facts": ["fakta 1", "fakta 2"], // Jika ada informasi permanen (contoh: Punya anjing bernama Budi)
  "new_events": [
     {"event": "User bercerita dia baru putus cinta hari ini", "emotion": "sad"} // Jika ada kejadian/pengalaman spesifik
  ]
}
Jika tidak ada informasi yang penting untuk diingat, kembalikan array kosong []. Jangan berikan markdown block.`;

/**
 * Reflection Engine (Berjalan di background via waitUntil)
 * Membaca percakapan terakhir dan menyimpannya sebagai memori jangka panjang (Semantic/Episodic).
 */
export async function runReflectionEngine(supabase, userId, workingMemory) {
    if (!GROQ_API_KEY || workingMemory.length < 2) return;
    
    try {
        // Ambil 5 pesan terakhir untuk direnungkan
        const recentChats = workingMemory.slice(-5);
        const conversationString = recentChats.map(m => `${m.role}: ${m.content}`).join('\n');
        
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "qwen/qwen3.6-27b", // Model Qwen 3.6 di Groq
                messages: [
                    { role: "system", content: REFLECTION_PROMPT },
                    { role: "user", content: conversationString }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            })
        });

        if (!response.ok) {
            console.error("Reflection API Error:", await response.text());
            return;
        }

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);
        
        // 1. Simpan fakta ke Semantic Memory (tabel lama)
        if (content.new_facts && content.new_facts.length > 0) {
            for (const fact of content.new_facts) {
                await supabase.from('memories').insert({ telegram_id: userId, fact: fact });
            }
        }
        
        // 2. Simpan kejadian ke Episodic Memory (tabel pgvector baru)
        if (content.new_events && content.new_events.length > 0) {
            for (const ev of content.new_events) {
                await saveEpisodicMemory(supabase, userId, ev.event, ev.emotion);
            }
        }

        console.log(`[REFLECTION] Selesai merenungkan. ${content.new_facts?.length || 0} fakta baru, ${content.new_events?.length || 0} kejadian baru.`);
    } catch (e) {
        console.error("Reflection Engine Exception:", e);
    }
}
