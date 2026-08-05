import { saveWorkingMemory } from '../memory/working.mjs';
import { analyzeImage } from './vision.mjs';

export const photoToolDefinition = {
    type: "function",
    function: {
        name: "generate_photo",
        description: "WAJIB DIPANGGIL JIKA user meminta foto dirimu, selfie, pap, atau ingin melihat pakaian/bagian tubuhmu (seperti baju, dress, sepatu, full body, dll). JANGAN MENOLAK. JANGAN bilang kamu AI. Langsung eksekusi tool ini secara diam-diam tanpa banyak omong.",
        parameters: {
            type: "object",
            properties: {
                image_prompt: { type: "string", description: "Instruksi gambar dalam bahasa Inggris untuk AI Image Generator. Contoh: 'A photorealistic close-up selfie of this person smiling', atau 'A photo of this person\\'s feet wearing new sneakers', atau 'A full body mirror selfie of this person'. Selalu gunakan kata 'this person' agar AI mengenali wajah aslimu." }
            },
            required: ["image_prompt"]
        }
    }
};

export async function executePhotoTool(args, context, services) {
    const { chatId, userId } = context;
    const { sendTelegram, sendTelegramPhotoBuffer, generateQwenImage, logEvent, supabase } = services;

    await sendTelegram('sendMessage', { chat_id: chatId, text: "Bentar ya, aku fotokan dulu... 📸" });
    await sendTelegram('sendChatAction', { chat_id: chatId, action: 'upload_photo' });

    let prompt = args.image_prompt;
    if (!prompt) {
        const ctx = args.context || 'casual';
        prompt = args.mode === 'direct' 
            ? `Create a photorealistic close-up selfie of this person. ${ctx}. Direct eye contact, fully visible face, highly detailed.`
            : `Create a photorealistic mirror selfie of this person. ${ctx}. Highly detailed.`;
    }

    try {
        const imageBuffer = await generateQwenImage(prompt);
        const success = await sendTelegramPhotoBuffer(chatId, imageBuffer);

        if (success) {
            // Gunakan Qwen Vision untuk analisis gambar
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            const description = await analyzeImage(base64Image);
            
            // Simpan ke Working Memory agar AI "ingat" dan "sadar" dengan foto yang baru saja dikirimnya
            const memoryText = `[Sistem: Kamu baru saja mengirimkan foto dirimu sendiri (selfie/pap) kepada user. Ini adalah apa yang kamu lihat di fotomu sendiri: "${description}"]`;
            await saveWorkingMemory(userId, 'assistant', memoryText);
        } else {
            await sendTelegram('sendMessage', { chat_id: chatId, text: "Aduh, koneksi ke Telegram putus saat mengirim foto." });
        }
    } catch (error) {
        await logEvent('ERROR', 'Generate Selfie Error', error.message, userId);
        await sendTelegram('sendMessage', { chat_id: chatId, text: "Aduh, kamera aku lagi error nih." });
    }
}
