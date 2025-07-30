const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    username: { type: String, required: true },
    feedbackText: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Feedback', feedbackSchema);
