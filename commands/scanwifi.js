const { analyzeSsid } = require('../wifi_analyzer');

module.exports = {
    name: 'scanwifi',
    regex: /\/scanwifi\s*(.*)/, // Regex ini menangkap teks setelah /scanwifi, atau tidak sama sekali
    execute: async (bot, msg, match) => {
        const chatId = msg.chat.id;
        const ssidInput = match[1] ? match[1].trim() : '';

        if (!ssidInput) {
            return bot.sendMessage(chatId, 'Silakan berikan nama WiFi (SSID) yang ingin dianalisis.\n\nContoh: `/scanwifi TP-Link_ECAA`');
        }

        try {
            const analysis = analyzeSsid(ssidInput);

            let report = `*Laporan Analisis untuk SSID: "${analysis.ssid}"*\n\n`;

            if (analysis.vulnerabilities.length > 0) {
                report += '🚨 *Potensi Kerentanan Ditemukan* 🚨\n';
                analysis.vulnerabilities.forEach(vuln => {
                    report += `- ${vuln}\n`;
                });
                report += '\n';
            }

            if (analysis.recommendations.length > 0) {
                report += '💡 *Rekomendasi* 💡\n';
                analysis.recommendations.forEach(rec => {
                    report += `- ${rec}\n`;
                });
            }

            // Tambahkan catatan etika di setiap laporan
            report += '\n\n---\n';
            report += '_Catatan: Fitur ini hanya untuk tujuan edukasi dan audit keamanan pada jaringan milik sendiri. Jangan disalahgunakan._';

            bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("Gagal menganalisis WiFi:", error);
            bot.sendMessage(chatId, "Maaf, terjadi kesalahan saat menganalisis WiFi.");
        }
    }
};
