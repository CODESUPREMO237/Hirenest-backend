// controllers/reviewController.js

const mongoose = require('mongoose'); // ✅ ADDED: Import mongoose
const Review = require('../models/Review');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * Create a new review
 * POST /api/v1/reviews
 */
exports.createReview = async (req, res) => {
  try {
    const { jobId, revieweeId, rating, comment } = req.body;
    const reviewerId = req.user._id; // ✅ FIX: Use _id instead of id

    // Validation
    if (!jobId || !revieweeId || !rating) {
      return res.status(400).json({
        status: 'fail',
        message: 'jobId, revieweeId, and rating are required'
      });
    }

    // Prevent self-review
    if (reviewerId.toString() === revieweeId.toString()) {
      return res.status(400).json({
        status: 'fail',
        message: 'You cannot review yourself'
      });
    }

    // Check if reviewee exists
    const reviewee = await User.findById(revieweeId);
    if (!reviewee) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reviewee not found'
      });
    }

    // 1. Create the review
    const review = await Review.create({
      job: jobId,
      reviewer: reviewerId,
      reviewee: revieweeId,
      rating: parseFloat(rating),
      comment: comment?.trim() || ''
    });

    logger.info(`Review created: ${review._id} by ${reviewerId} for ${revieweeId}`);

    // 2. Aggregate average rating for the reviewee
    const stats = await Review.aggregate([
      { 
        $match: { 
          reviewee: new mongoose.Types.ObjectId(revieweeId) 
        } 
      },
      { 
        $group: { 
          _id: '$reviewee',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 }
        } 
      }
    ]);

    // 3. Update User profile with new stats
    // ✅ FIX: Handle case when stats array is empty
    if (stats.length > 0) {
      await User.findByIdAndUpdate(revieweeId, {
        ratingsAverage: stats[0].avgRating,
        ratingsQuantity: stats[0].count
      });

      logger.info(`Updated ratings for user ${revieweeId}: avg=${stats[0].avgRating.toFixed(2)}, count=${stats[0].count}`);
    } else {
      logger.warn(`No stats found for user ${revieweeId} after review creation`);
    }

    // Populate the review before sending response
    await review.populate([
      { path: 'reviewer', select: 'profile.firstName profile.lastName profile.avatar' },
      { path: 'reviewee', select: 'profile.firstName profile.lastName profile.avatar' }
    ]);

    res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully',
      data: { review }
    });

  } catch (err) {
    // Handle duplicate review error (unique index violation)
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'You have already reviewed this job'
      });
    }

    logger.error('Error creating review:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error creating review',
      error: err.message
    });
  }
};

/**
 * Get reviews for a specific user
 * GET /api/v1/reviews/user/:userId
 */
exports.getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reviews = await Review.find({ reviewee: userId })
      .populate('reviewer', 'profile.firstName profile.lastName profile.avatar')
      .populate('job', 'title companyName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ reviewee: userId });

    res.status(200).json({
      status: 'success',
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (err) {
    logger.error('Error fetching user reviews:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching reviews',
      error: err.message
    });
  }
};

/**
 * Get reviews for a specific job
 * GET /api/v1/reviews/job/:jobId
 */
exports.getJobReviews = async (req, res) => {
  try {
    const { jobId } = req.params;

    const reviews = await Review.find({ job: jobId })
      .populate('reviewer', 'profile.firstName profile.lastName profile.avatar')
      .populate('reviewee', 'profile.firstName profile.lastName profile.avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: { reviews }
    });

  } catch (err) {
    logger.error('Error fetching job reviews:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching reviews',
      error: err.message
    });
  }
};

/**
 * Delete a review (reviewer only)
 * DELETE /api/v1/reviews/:reviewId
 */
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user._id;

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        status: 'fail',
        message: 'Review not found'
      });
    }

    // Check if user is the reviewer
    if (review.reviewer.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'You can only delete your own reviews'
      });
    }

    await review.deleteOne();

    // Recalculate ratings for the reviewee
    const stats = await Review.aggregate([
      { $match: { reviewee: review.reviewee } },
      { $group: { _id: '$reviewee', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    if (stats.length > 0) {
      await User.findByIdAndUpdate(review.reviewee, {
        ratingsAverage: stats[0].avgRating,
        ratingsQuantity: stats[0].count
      });
    } else {
      // No reviews left, reset to zero
      await User.findByIdAndUpdate(review.reviewee, {
        ratingsAverage: 0,
        ratingsQuantity: 0
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Review deleted successfully'
    });

  } catch (err) {
    logger.error('Error deleting review:', err);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting review',
      error: err.message
    });
  }
};