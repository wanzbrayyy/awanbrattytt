const Feedback = require('../models/feedback');
const config = require('../config');

module.exports = {
    name: 'feedback',
    regex: /\/feedback/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;

        bot.sendMessage(chatId, '📝 Silakan ketik dan kirimkan masukan Anda untuk bot ini. Admin akan meninjaunya sesegera mungkin.');

        bot.once('message', async (feedbackMsg) => {
            // Pastikan pesan berasal dari user yang sama dan bukan perintah lain
            if (feedbackMsg.chat.id !== chatId || feedbackMsg.text.startsWith('/')) {
                return;
            }

            const feedbackText = feedbackMsg.text;
            const userId = feedbackMsg.from.id;
            const username = feedbackMsg.from.username ? `@${feedbackMsg.from.username}` : (feedbackMsg.from.first_name || 'Pengguna');

            try {
                const newFeedback = new Feedback({
                    userId,
                    username,
                    feedbackText
                });

                await newFeedback.save();

                // Konfirmasi ke pengguna
                bot.sendMessage(chatId, '✅ **Terima kasih!**\\n\\nMasukan Anda telah kami terima dan akan sangat membantu kami untuk berkembang menjadi lebih baik lagi. ✨');

                // Kirim notifikasi ke admin dengan format baru dan tombol balas
                const adminNotification = `
- - - - - - - - - - - - - -
📮 **FEEDBACK BARU** 📮
- - - - - - - - - - - - - -
👤 **Dari:**
   - **User:** ${username}
   - **ID:** \`${userId}\`

💬 **Pesan:**
${feedbackText}
- - - - - - - - - - - - - -
`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            {
                                text: '✍️ Balas Pesan Ini',
                                callback_data: `reply_feedback_${userId}`
                            }
                        ]
                    ]
                };

                bot.sendMessage(config.adminId, adminNotification, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

            } catch (error) {
                console.error("Gagal menyimpan feedback:", error);
                bot.sendMessage(chatId, 'Maaf, terjadi kesalahan saat menyimpan masukan Anda. Silakan coba lagi nanti.');
            }
        });
    }
};
