// --- QWEN VISION AI ---
export async function analyzeImage(imageBase64) {
    const apiKey = process.env.QWEN_API_KEY || 'sk-ws-H.ILHDHP.fakn.MEYCIQDGQZgkorFTHh9mN1IlzQTeZ8zRIs6mpfQd9UiznuGVOgIhAKIPOHid-8zDdxd5uk0Fpz70IajHWahhfqgiFvq6NL1m';
    const url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
    const body = {
        model: "qwen-vl-max",
        messages: [
            {
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: imageBase64 } },
                    { type: "text", text: "Tolong deskripsikan gambar ini dengan sangat detail dalam bahasa Indonesia. Jika ini adalah gambar pakaian/baju, sebutkan warna, bahan, motif, dan gayanya. (Maksimal 2-3 kalimat)" }
                ]
            }
        ]
    };
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) return "Foto yang dikirim tidak jelas.";
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Gambar tidak diketahui.";
}

// --- GROQ VISION AI (Qwen 3.6) ---
export async function analyzeImageWithGroq(imageBase64) {
    const apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey) return "Deskripsi tidak tersedia (GROQ_API_KEY tidak ada).";

    const url = "https://api.groq.com/openai/v1/chat/completions";
    const body = {
        model: "qwen/qwen3.6-27b",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: "Deskripsikan secara singkat dan detail apa yang terlihat di foto selfie ini. Fokus pada penampilan, pakaian, pose, dan ekspresi wajah. (Maksimal 2 kalimat)" },
                    { type: "image_url", image_url: { url: imageBase64 } }
                ]
            }
        ],
        temperature: 0.2
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            console.error("Groq Vision Error:", await response.text());
            return "Foto yang dikirim tidak jelas.";
        }
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Gambar tidak dapat dianalisis.";
    } catch (error) {
        console.error("Groq Vision Exception:", error);
        return "Terjadi kesalahan saat melihat foto.";
    }
}
