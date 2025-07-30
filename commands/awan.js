const axios = require('axios');

module.exports = {
    name: 'awan',
    regex: /\/awan (.+)/,
    execute: async (bot, msg, match) => {
        const chatId = msg.chat.id;
        const query = match[1];

        if (!query) {
            return bot.sendMessage(chatId, 'Silakan berikan pertanyaan setelah perintah /awan.\\n\\nContoh: `/awan apa itu AI?`', { parse_mode: 'Markdown' });
        }

        try {
            // Menampilkan pesan "sedang memproses"
            const processingMessage = await bot.sendMessage(chatId, '🤖 Asisten Awan sedang memproses permintaan Anda...');

            // Panggil API AI di sini
            const response = await axios.get(`https://api.akuari.my.id/ai/gpt?chat=${encodeURIComponent(query)}`);
            const aiResponse = response.data.respon;

            // Edit pesan "sedang memproses" dengan jawaban dari AI
            bot.editMessageText(`🤖 *Asisten Awan Menjawab:*\n\n${aiResponse}`, {
                chat_id: chatId,
                message_id: processingMessage.message_id,
                parse_mode: 'Markdown'
            });

        } catch (error) {
            console.error("Gagal memanggil API AI:", error);
            bot.sendMessage(chatId, 'Maaf, Asisten Awan sedang sibuk. Coba lagi nanti.');
        }
    }
};
