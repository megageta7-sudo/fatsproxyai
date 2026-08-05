import { parseUserMessage } from "./src/perception/parser.mjs";

async function run() {
    const testMessages = [
        "Halo Airish! Hari ini cuacanya cerah banget ya, aku seneng deh akhirnya bisa liburan.",
        "Duh, aku lagi pusing banget kerjaan numpuk gak selesai-selesai.",
        "Eh, kamu tau gak? Kucingku si Bubu habis melahirkan 3 anak kembar lho!",
        "Aku baru aja gagal interview di Tokopedia... sedih banget rasanya..."
    ];

    console.log("=== TESTING GROQ PERCEPTION LAYER (Qwen 3.6 27B) ===\n");
    
    for (const msg of testMessages) {
        console.log(`User Input: "${msg}"`);
        
        const start = Date.now();
        const perception = await parseUserMessage(msg);
        const latency = Date.now() - start;
        
        console.log(`[Waktu Proses: ${latency} ms]`);
        console.log("Hasil Ekstraksi Emosi & Intent:", JSON.stringify(perception, null, 2));
        console.log("--------------------------------------------------\n");
    }
}

run();
