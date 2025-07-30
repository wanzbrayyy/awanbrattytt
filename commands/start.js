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
                user = new User({ chatId: chatId, type: msg.chat.type, joinDate: moment().format() });
                await user.save();
            }

            if (startPayload) {
                const productId = startPayload;
                // Since showProductDetail is in utils, it needs the bot object.
                showProductDetail(bot, chatId, productId);
            } else {
                // Same for sendStartMessage.
                sendStartMessage(bot, chatId, isAdmin(userId));
            }
        } catch (error) {
            console.error("Gagal menangani /start:", error.message);
            bot.sendMessage(chatId, "Terjadi kesalahan saat memproses perintah. Coba lagi nanti.");
        }
    }
};
