// ============================================================================
// SAVED SEARCH MODEL
// src/models/SavedSearch.js
// ============================================================================

const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // What kind of search
  searchType: {
    type: String,
    enum: ['job', 'product'],
    required: true
  },

  // Human-readable name
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  // The search criteria (stored as flexible JSON)
  criteria: {
    query: String,          // text search
    category: String,
    location: String,
    minPrice: Number,
    maxPrice: Number,
    jobType: String,        // full-time, part-time, etc.
    experienceLevel: String,
    skills: [String],
    sortBy: String
  },

  // Alerting
  alertsEnabled: {
    type: Boolean,
    default: true
  },

  // Track when we last checked for new matches
  lastCheckedAt: {
    type: Date,
    default: Date.now
  },

  // Track how many new matches since last check
  newMatchCount: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true
});

savedSearchSchema.index({ user: 1, searchType: 1 });
savedSearchSchema.index({ alertsEnabled: 1, lastCheckedAt: 1 });

const SavedSearch = mongoose.model('SavedSearch', savedSearchSchema);

module.exports = SavedSearch;
