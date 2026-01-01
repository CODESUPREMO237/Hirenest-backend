const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true },
}, { timestamps: true });

// Prevent a user from rating the same job twice
reviewSchema.index({ job: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);