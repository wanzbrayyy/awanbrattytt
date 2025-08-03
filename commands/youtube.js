const { fork } = require('child_process');
const path = require('path');

const userStates = {};

function handleYoutubeTools(bot, chatId) {
    userStates[chatId] = { step: 'awaiting_url' };
    bot.sendMessage(chatId, 'Silakan masukkan URL video YouTube:');
}

async function handleYoutubeMessage(bot, msg) {
    const chatId = msg.chat.id;
    const userState = userStates[chatId];

    if (!userState) return;

    const text = msg.text;

    try {
        switch (userState.step) {
            case 'awaiting_url':
                if (!text.toLowerCase().startsWith('http')) {
                    return bot.sendMessage(chatId, "URL tidak valid. Harap masukkan URL yang benar.");
                }
                userState.url = text;
                userState.step = 'awaiting_view_count';
                bot.sendMessage(chatId, 'Berapa kali video harus ditonton? (misal: 5)');
                break;

            case 'awaiting_view_count':
                userState.view_count = parseInt(text, 10);
                if (isNaN(userState.view_count) || userState.view_count <= 0) {
                    return bot.sendMessage(chatId, "Jumlah tidak valid. Harap masukkan angka positif.");
                }
                userState.step = 'awaiting_watch_time';
                bot.sendMessage(chatId, 'Berapa lama setiap penayangan (dalam detik)? (misal: 60)');
                break;

            case 'awaiting_watch_time':
                userState.watch_time = parseInt(text, 10);
                if (isNaN(userState.watch_time) || userState.watch_time <= 0) {
                    return bot.sendMessage(chatId, "Waktu tonton tidak valid. Harap masukkan angka positif.");
                }

                const finalState = { ...userState };
                delete userStates[chatId];

                await bot.sendMessage(chatId, `✅ Konfigurasi diterima. Memulai ${finalState.view_count} penayangan...`);

                for (let i = 0; i < finalState.view_count; i++) {
                    await bot.sendMessage(chatId, `▶️ Memulai penayangan ${i + 1} dari ${finalState.view_count}...`);
                    
                    const executorPath = path.resolve(__dirname, '..', 'youtube-executor.js');
                    
                    await new Promise((resolve, reject) => {
                        const child = fork(executorPath, [], { stdio: 'pipe' });

                        child.send({
                            url: finalState.url,
                            watchTime: finalState.watch_time
                        });

                        child.on('message', async (message) => {
                            if (message.status === 'success') {
                                await bot.sendMessage(chatId, `✅ Penayangan ${i + 1} selesai.`);
                            } else {
                                await bot.sendMessage(chatId, `❌ Gagal pada penayangan ${i + 1}: ${message.message}`);
                            }
                        });

                        child.on('exit', (code) => {
                            if (code !== 0) {
                                console.error(`Child process exited with code ${code}`);
                            }
                            resolve();
                        });

                        child.on('error', async (err) => {
                            console.error('Failed to start child process.', err);
                            await bot.sendMessage(chatId, `Gagal memulai proses untuk penayangan ${i + 1}.`);
                            reject(err);
                        });
                    });
                }
                await bot.sendMessage(chatId, '🎉 Semua proses penayangan telah selesai.');
                break;
        }
    } catch (e) {
        console.error("Error in handleYoutubeMessage:", e);
        bot.sendMessage(chatId, "Terjadi kesalahan yang tidak terduga.");
        delete userStates[chatId];
    }
}

module.exports = {
    handleYoutubeTools,
    handleYoutubeMessage,
    userStates
};
