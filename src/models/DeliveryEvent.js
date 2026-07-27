const mongoose = require('mongoose');

const deliveryEventSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  eventType: {
    type: String,
    enum: [
      'otp_attempt_failed', 
      'otp_verified', 
      'buyer_rejected_item', 
      'dispute_opened',
      'dispute_resolved'
    ],
    required: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed // JSON for things like failed attempt count or decline reason
  }
}, {
  timestamps: true
});

// Index for retrieving an order's delivery events history
deliveryEventSchema.index({ order: 1, createdAt: 1 });

const DeliveryEvent = mongoose.model('DeliveryEvent', deliveryEventSchema);

module.exports = DeliveryEvent;
