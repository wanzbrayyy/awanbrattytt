const User = require('../models/user');

module.exports = {
    name: 'saldoku',
    regex: /\/saldoku/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;

        try {
            const user = await User.findOne({ chatId: chatId });

            if (!user) {
                return bot.sendMessage(chatId, "Profil Anda tidak ditemukan. Silakan ketik /start untuk membuat profil.");
            }

            const saldo = `Rp ${user.saldo.toLocaleString('id-ID')}`;

            const saldoMessage = `💰 Saldo Anda saat ini adalah: *${saldo}*`;

            bot.sendMessage(chatId, saldoMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("Gagal mengecek saldo:", error);
            bot.sendMessage(chatId, "Terjadi kesalahan saat mencoba mengambil data saldo Anda.");
        }
    }
};
