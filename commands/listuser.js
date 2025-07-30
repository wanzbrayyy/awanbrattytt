const User = require('../models/user');
const { isAdmin, createInlineKeyboard } = require('../utils');

const escapeMarkdown = (text) => {
    if (!text) return '';
    // This is for MarkdownV2. Note the characters that need escaping.
    return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
};

module.exports = {
    name: 'listuser',
    regex: /^\/listuser$/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // 1. Cek apakah pengguna adalah admin
        if (!isAdmin(userId)) {
            return bot.sendMessage(chatId, "Maaf, perintah ini hanya untuk Admin.");
        }

        try {
            // 2. Ambil semua pengguna dari database
            const users = await User.find({});

            if (users.length === 0) {
                return bot.sendMessage(chatId, "Tidak ada pengguna yang terdaftar di database.");
            }

            bot.sendMessage(chatId, `Menyiapkan daftar ${users.length} pengguna...`);

            // 3. Kirim pesan untuk setiap pengguna dengan tombol inline
            for (const user of users) {
                // Lewati pengguna jika mereka tidak memiliki chatId untuk mencegah error
                if (!user.chatId) {
                    console.log(`Melewatkan pengguna karena chatId tidak valid: ${user._id}`);
                    continue;
                }

                const username = escapeMarkdown(user.username ? `@${user.username}` : 'Tidak ada');
                const premiumStatus = user.isPremium ? '✅ Premium' : '❌ Belum Premium';

                let userText = `👤 *Info Pengguna*\n\n`;
                userText += `**User ID:** \`${user._id}\`\n`;
                userText += `**Username:** ${username}\n`;
                userText += `**Chat ID:** \`${user.chatId}\`\n`;
                userText += `**Status:** ${premiumStatus}`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            {
                                text: "Jadikan Premium",
                                callback_data: `add_premium_${user.chatId}`
                            }
                        ]
                    ]
                };

                await bot.sendMessage(chatId, userText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        } catch (error) {
            console.error("Gagal menjalankan perintah /listuser:", error);
            bot.sendMessage(chatId, "Terjadi kesalahan saat mengambil daftar pengguna.");
        }
    }
};
