const mongoose = require('mongoose');

const ratSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    chatId: { type: Number, required: true },
    lastSeen: { type: Date, default: Date.now },
    pendingCommand: { type: String, default: null },
});

module.exports = mongoose.model('Rat', ratSchema);
