const User = require('../models/user');

module.exports = {
    name: 'lokasisaya',
    regex: /\/lokasisaya/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;

        const opts = {
            reply_markup: {
                keyboard: [
                    [{
                        text: '📍 Kirim Lokasi Saya',
                        request_location: true
                    }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };

        bot.sendMessage(chatId, 'Silakan tekan tombol di bawah untuk membagikan lokasi Anda.', opts);

        bot.once('location', async (locationMsg) => {
            // Pastikan pesan lokasi berasal dari user yang sama
            if (locationMsg.chat.id !== chatId) {
                return;
            }

            const { latitude, longitude } = locationMsg.location;

            try {
                const user = await User.findOneAndUpdate(
                    { chatId: chatId },
                    { $set: { location: { latitude, longitude } } },
                    { new: true, upsert: true } // new: true mengembalikan dokumen yang sudah diupdate, upsert: true membuat dokumen jika tidak ada
                );

                if (user) {
                    // Hapus custom keyboard dan kirim konfirmasi
                    await bot.sendMessage(chatId, 'Terima kasih! Lokasi Anda telah disimpan.', {
                        reply_markup: {
                            remove_keyboard: true
                        }
                    });
                    // Kirim peta sebagai konfirmasi
                    await bot.sendLocation(chatId, latitude, longitude);
                } else {
                     await bot.sendMessage(chatId, 'Gagal menyimpan lokasi. Silakan coba lagi.', {
                        reply_markup: {
                            remove_keyboard: true
                        }
                    });
                }
            } catch (error) {
                console.error("Gagal menyimpan lokasi:", error);
                await bot.sendMessage(chatId, 'Terjadi kesalahan saat menyimpan lokasi Anda.', {
                    reply_markup: {
                        remove_keyboard: true
                    }
                });
            }
        });
    }
};
