const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    imageUrl: { type: String },
    filePath: { type: String },
    mimeType: { type: String },
    productUrl: { type: String },
    uploadDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);