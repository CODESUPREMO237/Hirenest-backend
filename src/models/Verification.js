// ============================================================================
// VERIFICATION MODEL
// src/models/Verification.js
// ============================================================================

const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Type of verification
  type: {
    type: String,
    enum: ['identity', 'skill', 'education', 'employment'],
    required: true
  },

  // What specifically is being verified
  label: {
    type: String,
    required: true,
    trim: true
  },

  // Supporting documents
  documents: [{
    url: { type: String, required: true },
    filename: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Notes from the user
  userNote: {
    type: String,
    maxlength: 500
  },

  // Review status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // Admin review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNote: String

}, {
  timestamps: true
});

verificationSchema.index({ user: 1, type: 1 });
verificationSchema.index({ status: 1, createdAt: -1 });

const Verification = mongoose.model('Verification', verificationSchema);

module.exports = Verification;
