const User = require('../models/user');
const moment = require('moment');

module.exports = {
    name: 'cekprofil',
    regex: /\/cekprofil/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;

        try {
            const user = await User.findOne({ chatId: chatId });

            if (!user) {
                return bot.sendMessage(chatId, "Profil Anda tidak ditemukan. Silakan ketik /start untuk membuat profil.");
            }

            const username = msg.from.username ? `@${msg.from.username}` : 'Tidak diatur';
            const status = user.daftar ? 'Terdaftar' : 'Belum Terdaftar';
            const joinDate = moment(user.joinDate).format('DD MMMM YYYY');
            const saldo = `Rp ${user.saldo.toLocaleString('id-ID')}`;

            let lokasi = 'Belum diatur';
            if (user.location && user.location.latitude && user.location.longitude) {
                lokasi = `${user.location.latitude}, ${user.location.longitude}`;
            }

            const profileMessage = `
👤 *Profil Pengguna* 👤

- *Username:* ${username}
- *Chat ID:* \`${chatId}\`
- *Status:* ${status}
- *Bergabung pada:* ${joinDate}
- *Saldo:* ${saldo}
- *Lokasi:* ${lokasi}
            `;

            bot.sendMessage(chatId, profileMessage.trim(), { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("Gagal mengecek profil:", error);
            bot.sendMessage(chatId, "Terjadi kesalahan saat mencoba mengambil data profil Anda.");
        }
    }
};
