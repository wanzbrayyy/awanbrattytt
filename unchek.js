const axios = require('axios');

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function sendAkun(bot, chatId, type, quantity) {
    const urls = {
        akun_montoon: 'https://raw.githubusercontent.com/users002/Headers-banner-bukanmain-crott-dahsampesini/main/empas-monton',
        send_akun_fresh: 'https://raw.githubusercontent.com/users002/Headers-banner-bukanmain-crott-dahsampesini/main/empas-fresh',
        send_akun_emas: 'https://raw.githubusercontent.com/users002/Headers-banner-bukanmain-crott-dahsampesini/main/empass'
    };

    const url = urls[type];
    if (!url) {
        return bot.sendMessage(chatId, "Tipe akun tidak valid.");
    }

    try {
        const response = await axios.get(url);
        let accounts = response.data.split('\n').filter(line => line.trim() !== '');
        accounts = shuffle(accounts);

        const numToSend = Math.min(quantity, accounts.length);
        if (numToSend === 0) {
            return bot.sendMessage(chatId, "Tidak ada akun yang tersedia untuk tipe ini.");
        }

        bot.sendMessage(chatId, `Mengirim ${numToSend} akun...`);

        for (let i = 0; i < numToSend; i++) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
            bot.sendMessage(chatId, accounts[i]);
        }

        bot.sendMessage(chatId, "Selesai mengirim akun.");

    } catch (error) {
        console.error("Gagal mengambil data akun:", error);
        bot.sendMessage(chatId, "Terjadi kesalahan saat mengambil data akun. Coba lagi nanti.");
    }
}

module.exports = { sendAkun };
