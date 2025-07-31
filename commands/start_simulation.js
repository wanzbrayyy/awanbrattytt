const DoxwareSimulation = require('../models/doxwareSimulation');
const { createInlineKeyboard } = require('../utils');

module.exports = {
    name: 'start_simulation',
    regex: /\/start_simulation(?: (.+))?/,
    execute: async (bot, msg, match) => {
        const chatId = msg.chat.id;
        const simulationId = match[1];

        if (!simulationId) {
            return; // Ignore if no ID is provided
        }

        try {
            const simulation = await DoxwareSimulation.findOne({ simulationId: simulationId.trim() });

            if (!simulation) {
                // Silently fail for the victim to not arouse suspicion, or send a generic error.
                // For educational purposes, a clear message is better.
                return bot.sendMessage(chatId, "ID Simulasi tidak valid atau telah kedaluwarsa.");
            }

            // Prevent the creator from "infecting" themselves
            if (simulation.creatorChatId === chatId) {
                return bot.sendMessage(chatId, "Anda tidak dapat menjalankan simulasi yang Anda buat sendiri pada diri sendiri.");
            }

            if (simulation.status !== 'pending') {
                return bot.sendMessage(chatId, "Simulasi ini sudah berjalan atau telah selesai.");
            }

            // Update the simulation with the victim's chat ID and set status to 'connected'
            simulation.victimChatId = chatId;
            simulation.status = 'connected';
            await simulation.save();

            // Notify the victim that something (seemingly innocuous) happened
            await bot.sendMessage(chatId, `Berhasil menjalankan \`${simulation.fileName}\`. Tidak ada tindakan lebih lanjut yang diperlukan.`);

            // Notify the premium user (creator)
            const creatorChatId = simulation.creatorChatId;
            const victimUsername = msg.from.username ? `@${msg.from.username}` : `ID: ${chatId}`;
            const notificationMessage = `✅ **Doxware Connected!**\n\nTarget (${victimUsername}) telah menjalankan \`${simulation.fileName}\`.\n\nAnda sekarang dapat melanjutkan untuk 'mengenkripsi' data mereka.`;
            const keyboard = createInlineKeyboard([
                { text: "🔐 Enkripsi Data Target", callback_data: `doxware_encrypt_${simulation.simulationId}` }
            ]);

            await bot.sendMessage(creatorChatId, notificationMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error("Gagal menangani /start_simulation:", error);
            bot.sendMessage(chatId, "Terjadi kesalahan saat memproses simulasi.");
        }
    }
};
