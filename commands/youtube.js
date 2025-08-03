const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');

const userStates = {};

const GITHUB_RAW_BASE_URL = 'https://raw.githubusercontent.com/gavintranquilino/YouTube-view-bot/master/';
const PYTHON_FILES = ['main.py', 'driver.py'];

async function downloadFile(fileUrl, outputPath) {
    try {
        const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream',
        });
        const writer = require('fs').createWriteStream(outputPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Gagal mengunduh ${fileUrl}:`, error);
        throw new Error(`Gagal mengunduh file ${path.basename(outputPath)}.`);
    }
}

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
                userState.url = text;
                userState.step = 'awaiting_tab_amount';
                bot.sendMessage(chatId, 'Masukkan jumlah tab (misal: 3):');
                break;
            case 'awaiting_tab_amount':
                userState.tab_amount = parseInt(text, 10);
                if (isNaN(userState.tab_amount) || userState.tab_amount <= 0) {
                    return bot.sendMessage(chatId, "Jumlah tab tidak valid. Harap masukkan angka positif.");
                }
                userState.step = 'awaiting_watch_time';
                bot.sendMessage(chatId, 'Masukkan waktu tonton dalam detik (misal: 35):');
                break;
            case 'awaiting_watch_time':
                userState.watch_time = parseInt(text, 10);
                if (isNaN(userState.watch_time) || userState.watch_time <= 0) {
                    return bot.sendMessage(chatId, "Waktu tonton tidak valid. Harap masukkan angka positif.");
                }
                userState.step = 'awaiting_view_cycles';
                bot.sendMessage(chatId, 'Masukkan jumlah siklus tampilan (misal: 5):');
                break;
            case 'awaiting_view_cycles':
                userState.view_cycles = parseInt(text, 10);
                if (isNaN(userState.view_cycles) || userState.view_cycles <= 0) {
                    return bot.sendMessage(chatId, "Jumlah siklus tidak valid. Harap masukkan angka positif.");
                }

                // Hapus state sebelum memulai proses yang panjang
                const finalState = { ...userState };
                delete userStates[chatId];

                await bot.sendMessage(chatId, '✅ Konfigurasi diterima. Mempersiapkan dan menjalankan skrip... Ini mungkin memakan waktu 1-2 menit. Mohon tunggu.');

                const tempDir = path.join(__dirname, '..', 'temp', `youtube_${chatId}_${Date.now()}`);
                await fs.mkdir(tempDir, { recursive: true });

                try {
                    // Unduh skrip Python
                    for (const fileName of PYTHON_FILES) {
                        const fileUrl = `${GITHUB_RAW_BASE_URL}${fileName}`;
                        const outputPath = path.join(tempDir, fileName);
                        await downloadFile(fileUrl, outputPath);
                    }

                    // Buat config.json
                    const config = {
                        website: finalState.url,
                        tab_amount: finalState.tab_amount,
                        watch_time: finalState.watch_time,
                        view_cycles: finalState.view_cycles,
                        browser: "firefox"
                    };
                    const configPath = path.join(tempDir, 'config.json');
                    await fs.writeFile(configPath, JSON.stringify(config, null, 4));

                    // Ganti browser di driver.py ke chromium
                    const driverPyPath = path.join(tempDir, 'driver.py');
                    let driverPyContent = await fs.readFile(driverPyPath, 'utf8');
                    driverPyContent = driverPyContent.replace('webdriver.Firefox(options=options)', 'webdriver.Chrome(options=options)');
                    driverPyContent = driverPyContent.replace('from selenium.webdriver.firefox.options import Options', 'from selenium.webdriver.chrome.options import Options');
                    await fs.writeFile(driverPyPath, driverPyContent);


                    // Jalankan skrip
                    const command = `python3 main.py`;
                    exec(command, { cwd: tempDir, timeout: 300000 }, async (error, stdout, stderr) => { // Timeout 5 menit
                        if (error) {
                            console.error(`Exec error: ${error}`);
                            await bot.sendMessage(chatId, `❌ Terjadi kesalahan saat menjalankan skrip:\n\n\`\`\`\n${stderr || error.message}\n\`\`\``, { parse_mode: 'Markdown' });
                        } else {
                            await bot.sendMessage(chatId, `✅ Proses selesai!\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
                        }
                        // Pembersihan
                        await fs.rm(tempDir, { recursive: true, force: true });
                    });

                } catch (e) {
                    console.error("Gagal dalam proses eksekusi:", e);
                    await bot.sendMessage(chatId, `Terjadi kesalahan fatal: ${e.message}`);
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
                break;
        }
    } catch (e) {
        console.error("Error in handleYoutubeMessage:", e);
        bot.sendMessage(chatId, "Terjadi kesalahan yang tidak terduga.");
        delete userStates[chatId]; // Hapus state jika terjadi error
    }
}

module.exports = {
    handleYoutubeTools,
    handleYoutubeMessage,
    userStates
};
