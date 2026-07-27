const mongoose = require('mongoose');

const escrowLedgerSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  eventType: {
    type: String,
    enum: ['held', 'released', 'refunded', 'partial_refund', 'adjustment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  actor: {
    type: String,
    required: true // 'system' | 'admin:<id>' | 'buyer:<id>' | 'seller:<id>'
  },
  note: {
    type: String
  }
}, {
  timestamps: true // Gives us createdAt for the ledger audit trail
});

// Index for easy querying of an order's ledger history
escrowLedgerSchema.index({ order: 1, createdAt: 1 });

const EscrowLedger = mongoose.model('EscrowLedger', escrowLedgerSchema);

module.exports = EscrowLedger;
