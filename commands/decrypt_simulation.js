const DoxwareSimulation = require('../models/doxwareSimulation');

module.exports = {
    name: 'decrypt_simulation',
    regex: /\/decrypt_simulation/,
    execute: async (bot, msg, match) => {
        const chatId = msg.chat.id;

        try {
            // Find an active simulation where the user is the victim
            const simulation = await DoxwareSimulation.findOne({ victimChatId: chatId, status: 'encrypted' });

            if (!simulation) {
                return bot.sendMessage(chatId, "Tidak ditemukan simulasi enkripsi yang aktif untuk Anda. Anda aman!");
            }

            bot.sendMessage(chatId, "🔑 Silakan masukkan kunci dekripsi yang Anda terima untuk memulihkan file simulasi Anda.");

            const listener = async (keyMsg) => {
                // Ensure the message is from the correct user and is not a command
                if (keyMsg.chat.id !== chatId || (keyMsg.text && keyMsg.text.startsWith('/'))) {
                    bot.once('message', listener); // Re-attach listener if message is invalid
                    return;
                }

                // It's a good practice to remove the listener once we have the message we need
                bot.removeListener('message', listener);

                const providedKey = keyMsg.text.trim();

                if (providedKey === simulation.decryptionKey) {
                    await bot.sendMessage(chatId, "✅ **Dekripsi Berhasil!**\n\nKunci yang Anda berikan benar. Semua file simulasi Anda telah 'dipulihkan' ke kondisi semula.");

                    // Notify the creator that the victim has successfully decrypted the files
                    const creatorUsername = msg.from.username ? `@${msg.from.username}` : `ID: ${chatId}`;
                    await bot.sendMessage(simulation.creatorChatId, `✅ Target (${creatorUsername}) telah berhasil mendekripsi file menggunakan kunci yang benar. Simulasi selesai.`);

                    // Delete the simulation from the database
                    await DoxwareSimulation.findByIdAndDelete(simulation._id);

                } else {
                    await bot.sendMessage(chatId, "❌ Kunci dekripsi salah. Proses dekripsi dibatalkan. Anda dapat mencoba lagi nanti dengan menjalankan /decrypt_simulation.");
                }
            };

            bot.once('message', listener);

        } catch (error) {
            console.error("Gagal menangani /decrypt_simulation:", error);
            bot.sendMessage(chatId, "Terjadi kesalahan saat mencoba mendekripsi simulasi.");
        }
    }
};
