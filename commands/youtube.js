const userStates = {};

function handleYoutubeTools(bot, chatId) {
    userStates[chatId] = { step: 'awaiting_url' };
    bot.sendMessage(chatId, 'Silakan masukkan URL video YouTube:');
}

function handleYoutubeMessage(bot, msg) {
    const chatId = msg.chat.id;
    const userState = userStates[chatId];

    if (!userState) return;

    const text = msg.text;

    switch (userState.step) {
        case 'awaiting_url':
            userState.url = text;
            userState.step = 'awaiting_tab_amount';
            bot.sendMessage(chatId, 'Masukkan jumlah tab (misal: 3):');
            break;
        case 'awaiting_tab_amount':
            userState.tab_amount = parseInt(text, 10);
            userState.step = 'awaiting_watch_time';
            bot.sendMessage(chatId, 'Masukkan waktu tonton dalam detik (misal: 35):');
            break;
        case 'awaiting_watch_time':
            userState.watch_time = parseInt(text, 10);
            userState.step = 'awaiting_view_cycles';
            bot.sendMessage(chatId, 'Masukkan jumlah siklus tampilan (misal: 5):');
            break;
        case 'awaiting_view_cycles':
            userState.view_cycles = parseInt(text, 10);
            const config = {
                website: userState.url,
                tab_amount: userState.tab_amount,
                watch_time: userState.watch_time,
                view_cycles: userState.view_cycles,
                browser: "firefox"
            };

            const jsonConfig = JSON.stringify(config, null, 4);
            const message = `Berikut adalah konfigurasi Anda:\n\n\`\`\`json\n${jsonConfig}\n\`\`\`\n\nUntuk menjalankan bot, simpan konfigurasi di atas sebagai file \`config.json\` dan jalankan perintah berikut di terminal Anda:\n\n\`\`\`bash\npython main.py\n\`\`\``;

            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            delete userStates[chatId]; // Hapus state setelah selesai
            break;
    }
}

module.exports = {
    handleYoutubeTools,
    handleYoutubeMessage,
    userStates
};
