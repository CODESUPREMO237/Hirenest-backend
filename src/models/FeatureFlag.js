// ============================================================================
// FEATURE FLAG MODEL
// src/models/FeatureFlag.js
// ============================================================================

const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema({
  // Unique key for the flag
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^[a-z0-9_]+$/ // snake_case only
  },

  // Human-readable name
  name: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    default: ''
  },

  // Is the flag enabled?
  enabled: {
    type: Boolean,
    default: false
  },

  // Target specific roles (empty = all roles)
  targetRoles: [{
    type: String,
    enum: ['jobseeker', 'employer', 'guest', 'admin']
  }],

  // Rollout percentage (0-100)
  rolloutPercentage: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  }

}, {
  timestamps: true
});

const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);

module.exports = FeatureFlag;
