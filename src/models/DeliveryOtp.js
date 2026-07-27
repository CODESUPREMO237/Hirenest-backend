const mongoose = require('mongoose');

const deliveryOtpSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true
  },
  codeHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
  },
  status: {
    type: String,
    enum: ['active', 'verified', 'expired', 'locked'],
    default: 'active'
  },
  verifiedAt: Date,
  verifiedByChannel: {
    type: String,
    enum: ['app', 'sms_fallback']
  }
}, {
  timestamps: true
});

const DeliveryOtp = mongoose.model('DeliveryOtp', deliveryOtpSchema);

module.exports = DeliveryOtp;
