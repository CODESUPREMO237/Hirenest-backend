// ============================================================================
// PLAN MODEL — Subscription Plans
// src/models/Plan.js
// ============================================================================

const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  // Target audience
  targetRole: {
    type: String,
    enum: ['jobseeker', 'employer', 'all'],
    default: 'all'
  },

  // Pricing
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'XAF'
  },

  // Duration
  durationDays: {
    type: Number,
    required: true,
    min: 1
  },

  // Features/limits
  features: {
    maxBoostedListings: { type: Number, default: 0 },
    boostDurationDays: { type: Number, default: 7 },
    prioritySupport: { type: Boolean, default: false },
    unlimitedSearches: { type: Boolean, default: false },
    verifiedBadge: { type: Boolean, default: false },
    maxJobPostings: { type: Number, default: 5 },
    maxProductListings: { type: Number, default: 10 }
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // Display order
  sortOrder: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true
});

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
