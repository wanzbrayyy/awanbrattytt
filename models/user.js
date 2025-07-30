const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    chatId: { type: Number, required: true, unique: true },
    email: { type: String, unique: false, sparse: true },
    saldo: { type: Number, default: 0 },
    daftar: { type: Boolean, default: false },
    type: { type: String, enum: ['private', 'group', 'supergroup', 'channel'], default: 'private' },
    joinDate: { type: Date, default: Date.now },
    location: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    cart: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], // referensi carts
});

module.exports = mongoose.model('User', userSchema);
