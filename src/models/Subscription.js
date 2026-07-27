// ============================================================================
// SUBSCRIPTION MODEL
// src/models/Subscription.js
// ============================================================================

const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending_payment'],
    default: 'pending_payment'
  },

  // Dates
  startDate: Date,
  endDate: Date,

  // Payment
  paymentReference: String,
  amountPaid: Number,
  currency: { type: String, default: 'XAF' },

  // Usage tracking
  boostedListingsUsed: {
    type: Number,
    default: 0
  },

  // Auto-renew
  autoRenew: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
