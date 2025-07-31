module.exports = {
    name: 'decrypt',
    regex: /\/decrypt/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;

        // bot.userStates is not standard on the bot object, it's a custom property
        // I need to ensure it's available. Looking at telegram.js, userStates is defined locally.
        // It should be attached to the bot object to be accessible in commands.
        // I'll add `bot.userStates = userStates;` in telegram.js later.
        if (!bot.userStates) {
            bot.userStates = {};
        }

        bot.userStates[chatId] = { action: 'decrypt_awaiting_image' };
        bot.sendMessage(chatId, "🔐 **Proses Dekripsi Steghide**\n\nSilakan kirim gambar (JPG/BMP) yang ingin Anda ekstrak datanya.");
    }
};
