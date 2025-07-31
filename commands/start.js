const User = require('../models/user');
const moment = require('moment');
const { sendStartMessage, showProductDetail } = require('../utils');
const { isAdmin } = require('../utils');

module.exports = {
    name: 'start',
    regex: /\/start(?: (.+))?/,
    execute: async (bot, msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const startPayload = match[1];

        try {
            let user = await User.findOne({ chatId });
            if (!user) {
                // Buat pengguna baru dengan email placeholder yang unik untuk menghindari error duplikasi kunci
                user = new User({
                    chatId: chatId,
                    username: msg.from.username,
                    type: msg.chat.type,
                    joinDate: moment().format(),
                    email: `${chatId}@telegram.user` // Placeholder unik
                });
                await user.save();
            } else {
                // Jika pengguna sudah ada, periksa dan perbarui username jika perlu
                if (msg.from.username && user.username !== msg.from.username) {
                    user.username = msg.from.username;
                    await user.save();
                }
            }

            if (startPayload) {
                const productId = startPayload;
                showProductDetail(bot, chatId, productId);
            } else {
                // Teruskan status premium pengguna ke sendStartMessage
                sendStartMessage(bot, chatId, isAdmin(userId), false, user.isPremium);
            }
        } catch (error) {
            console.error("Gagal menangani /start:", error.message);
            bot.sendMessage(chatId, "Terjadi kesalahan saat memproses perintah. Coba lagi nanti.");
        }
    }
};
