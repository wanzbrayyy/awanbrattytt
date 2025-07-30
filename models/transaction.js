const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    type: { type: String, enum: ['deposit', 'purchase'], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // Jika ini pembelian
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);