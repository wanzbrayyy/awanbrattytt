const mongoose = require('mongoose');

const trackedLinkSchema = new mongoose.Schema({
    alias: { type: String, required: true, unique: true },
    creatorChatId: { type: Number, required: true },
    originalLink: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: '7d' } // Automatically delete after 7 days
});

module.exports = mongoose.model('TrackedLink', trackedLinkSchema);
