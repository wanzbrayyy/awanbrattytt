const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const mongoose = require('mongoose');
const axios = require('axios');
const config = require("./config");
const User = require('./models/user');
const Product = require('./models/product');
const Category = require('./models/category');
const Transaction = require('./models/transaction');
const Userbot = require('./models/userbot');
const { TDL } = require('@telepilotco/tdl');
const moment = require("moment");
const { createInlineKeyboard, isAdmin, sendStartMessage, showProductDetail } = require('./utils');

const bot = new TelegramBot(config.botToken, { polling: true });

// Command Handler
bot.commands = new Map();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    bot.commands.set(command.name, command);
}

const wishlists = {};
const carts = {};
const userbotSessions = {};

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

    // Command handling
    if (text) {
        let commandFound = false;
        for (const command of bot.commands.values()) {
            const match = text.match(command.regex);
            if (match) {
                await command.execute(bot, msg, match);
                commandFound = true;
                break;
            }
        }
        if (commandFound) return;
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
    apiId: 26316278, // Hardcoded for testing
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
  const chatId = query.message.chat.id;
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
    else if (data === "menfess") handleMenfess(chatId);
    else if (data === "confess") handleConfess(chatId);
    else if (data === "saran") handleSaran(chatId);
    else if (data === "laporan") handleLaporan(chatId);
    else if (data === "download_menu") showDownloadMenu(chatId);
    else if (data === "tiktok_v2") handleTikTokV2(chatId);
    else if (data === "twitter") handleTwitter(chatId);
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
    bot.sendMessage(chatId, "Untuk mengklaim trial userbot, kirimkan informasi dengan format:\n\n`nomor_telepon|user_hash`\n\nContoh:\n`+628123456789|12345abcde`", { parse_mode: "Markdown" });

    bot.once("message", async (msg) => {
        if (msg.chat.id !== chatId) return;
        const [phoneNumber, userHash] = msg.text.split("|");
        if (!phoneNumber || !userHash) {
            return bot.sendMessage(chatId, "Format salah. Coba lagi.");
        }

        try {
            const { client, session } = await AUTHUSERCLIENT(
                phoneNumber.trim(),
                config.apiId,
                userHash.trim(),
                () => {
                    return new Promise((resolve) => {
                        bot.sendMessage(chatId, "Masukkan kode OTP yang Anda terima di Telegram:");
                        bot.once("message", (otpMsg) => {
                            resolve(otpMsg.text.trim());
                        });
                    });
                },
                () => {
                    return new Promise((resolve) => {
                        bot.sendMessage(chatId, "Akun Anda dilindungi oleh verifikasi dua langkah. Masukkan kata sandi Anda:");
                        bot.once("message", (passwordMsg) => {
                            resolve(passwordMsg.text.trim());
                        });
                    });
                }
            );

            let userbot = await Userbot.findOne({ userId: chatId });
            if (userbot) {
                return bot.sendMessage(chatId, "Anda sudah memiliki userbot.");
            }

            userbot = new Userbot({
                userId: chatId,
                phoneNumber: phoneNumber.trim(),
                userHash: userHash.trim(),
                trialExpiry: moment().add(7, 'days').toDate(),
                isActive: true,
                tdlibSession: session,
            });

            await userbot.save();
            bot.sendMessage(chatId, "Userbot trial berhasil diaktifkan!");
        } catch (error) {
            console.error("Gagal mengaktifkan userbot:", error);
            bot.sendMessage(chatId, "Gagal mengaktifkan userbot. Silakan coba lagi.");
        }
    });
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
  try {
    const response = await axios({
      method: "GET",
      url: fileLink,
      responseType: "stream",
    });
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Gagal download file:", error);
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

    const promises = users.map(user => {
      return new Promise(async (resolve, reject) => {
        try {
            await bot.forwardMessage(user.chatId, chatId, sentMessage.message_id);
            resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    try {
      await Promise.all(promises);
      bot.sendMessage(chatId, `Pesan broadcast telah dikirim ke ${users.length} pengguna.`);
    } catch (error) {
      console.error("Gagal mengirim broadcast:", error);
      bot.sendMessage(chatId, "Terjadi kesalahan saat mengirim broadcast.");
    }
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

bot.on("polling_error", (error) => {
  console.error(error);
});

console.log(`${config.botName} berjalan...`);

// Implmen Function of AUTH
async function AUTHUSERCLIENT(phoneNumber, apiId, apiHash, getCode, getPassword) {
  const client = await initializeTDLibClient(apiId, apiHash);

  return new Promise((resolve, reject) => {
    client.on('update', async (update) => {
      if (update['@type'] === 'updateAuthorizationState') {
        const state = update.authorization_state;
        if (state['@type'] === 'authorizationStateWaitTdlibParameters') {
          await client.send({ '@type': 'setTdlibParameters', parameters: {} });
        } else if (state['@type'] === 'authorizationStateWaitEncryptionKey') {
          await client.send({ '@type': 'checkDatabaseEncryptionKey' });
        } else if (state['@type'] === 'authorizationStateWaitPhoneNumber') {
          await client.send({ '@type': 'setAuthenticationPhoneNumber', phone_number: phoneNumber });
        } else if (state['@type'] === 'authorizationStateWaitCode') {
          const code = await getCode();
          await client.send({ '@type': 'checkAuthenticationCode', code: code });
        } else if (state['@type'] === 'authorizationStateWaitPassword') {
          const password = await getPassword();
          await client.send({ '@type': 'checkAuthenticationPassword', password: password });
        } else if (state['@type'] === 'authorizationStateReady') {
          const session = await client.invoke({ '@type': 'getStorage', key: 'session' });
          resolve({ client, session: session.value });
        } else if (state['@type'] === 'authorizationStateClosing') {
          reject(new Error('Authorization closing'));
        } else if (state['@type'] === 'authorizationStateClosed') {
          reject(new Error('Authorization closed'));
        }
      }
    });
  });
}

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

module.exports = bot;
