// ============================================================================
// FULL COMPATIBLE ORDER MODEL
// src/models/Order.js
// ============================================================================

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // 1. Identification
  orderNumber: {
    type: String,
    unique: true,
    default: () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  type: {
    type: String,
    enum: ['purchase', 'deposit'],
    default: 'purchase'
  },

  // 2. Relations
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false // Optional for deposits
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 3. Product Info (Snapshots prevent data loss if product is deleted)
  productSnapshot: {
    name: String,
    description: String,
    images: [String],
    category: String
  },

  // 4. Pricing (Nested to match service logic)
  pricing: {
    productPrice: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    sellerAmount: { type: Number, required: true },
    currency: { type: String, default: 'XAF' }
  },

  // 5. Payment Details (MeSomb Integration)
  payment: {
    method: { type: String }, // e.g., 'mesomb_mtn'
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },
    phoneNumber: String,
    mesombReference: String,
    transactionId: String,
    paidAt: Date
  },

  // 6. Statuses
  status: {
    type: String,
    enum: [
      'pending_payment', 
      'payment_processing', 
      'paid', 
      'processing', 
      'shipped', 
      'delivered', 
      'completed', 
      'cancelled', 
      'refunded',
      // Escrow / OTP Delivery Statuses
      'PAID_ESCROW',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'DELIVERED_CONFIRMED',
      'RELEASED',
      'DELIVERY_REJECTED',
      'DISPUTED',
      'RESOLVED_SELLER',
      'RESOLVED_BUYER',
      'AUTO_RELEASED'
    ],
    default: 'pending_payment'
  },

  // 7. Delivery Info
  delivery: {
    method: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    status: { type: String, default: 'pending' },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    }
  },

  // 8. Communications & Metadata
  buyerNotes: String,
  sellerNotes: String,
  refund: {
    amount: Number,
    reason: String,
    requestedAt: Date,
    processedAt: Date,
    status: String
  },

  // 9. Escrow & OTP Delivery Tracking
  escrowHeldAt: Date,
  shippedAt: Date,
  deliveredConfirmedAt: Date,
  releasedAt: Date,
  autoReleaseDeadline: Date,
  deliveryMethod: { type: String, enum: ['rider', 'pickup_point', 'self_arranged'], default: 'self_arranged' },

  // 10. Soft Delete
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Auto-manages createdAt and updatedAt
});

// --- INDEXES (For speed) ---
orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });
orderSchema.index({ 'payment.mesombReference': 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;