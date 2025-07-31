const mongoose = require('mongoose');

const doxwareSimulationSchema = new mongoose.Schema({
    simulationId: { type: String, required: true, unique: true, index: true },
    creatorChatId: { type: Number, required: true, index: true },
    victimChatId: { type: Number, index: true },
    fileName: { type: String, required: true },
    decryptionKey: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'connected', 'encrypted'],
        default: 'pending'
    },
    ransomNote: { type: String },
    createdAt: { type: Date, default: Date.now, expires: '24h' } // Automatically delete after 24 hours
});

module.exports = mongoose.model('DoxwareSimulation', doxwareSimulationSchema);
