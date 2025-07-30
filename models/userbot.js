const mongoose = require('mongoose');

const userbotSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  userHash: { type: String, required: true },
  tdlibParameters: { type: Object },
  tdlibSession: { type: Object }, // Perbaikan: Tidak ada spasi di "tdlibSession"
  sessionString: { type: String },
  trialExpiry: { type: Date },
  isActive: { type: Boolean, default: false },
  notificationSettings: { type: Object, default: {} }
});

module.exports = mongoose.model('Userbot', userbotSchema);