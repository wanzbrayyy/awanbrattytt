const Transaction = require('../models/transaction');
const moment = require('moment');

module.exports = {
    name: 'riwayat',
    regex: /\/riwayat/,
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;

        try {
            // Temukan transaksi, urutkan dari yang terbaru, dan ambil detail produk jika ada
            const transactions = await Transaction.find({ userId: chatId })
                .sort({ date: -1 })
                .populate('productId'); // Ini akan mengambil detail dari produk yang terkait

            if (transactions.length === 0) {
                return bot.sendMessage(chatId, "Anda belum memiliki riwayat aktivitas.");
            }

            let historyMessage = '📜 *Riwayat Aktivitas Anda* 📜\n\n';

            transactions.forEach(tx => {
                const txDate = moment(tx.date).format('DD MMM YYYY, HH:mm');
                const amount = `Rp ${tx.amount.toLocaleString('id-ID')}`;

                if (tx.type === 'deposit') {
                    historyMessage += `✅ *Deposit* - ${amount}\n`;
                } else if (tx.type === 'purchase') {
                    // Jika produkId ada dan ter-populate, tampilkan nama produknya
                    const productName = tx.productId ? tx.productId.name : 'Produk Dihapus';
                    historyMessage += `🛒 *Pembelian* - ${productName} (${amount})\n`;
                }
                historyMessage += `   └─ _${txDate}_\n\n`;
            });

            bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("Gagal mengambil riwayat:", error);
            bot.sendMessage(chatId, "Terjadi kesalahan saat mencoba mengambil riwayat aktivitas Anda.");
        }
    }
};
