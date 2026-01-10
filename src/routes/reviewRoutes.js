// routes/review.routes.js

const express = require('express');
const router = express.Router();
const { 
  createReview, 
  getUserReviews, 
  getJobReviews, 
  deleteReview,
  checkUserReview
} = require('../controllers/reviewController');

const { authenticate } = require('../middleware/auth.middleware');

// ✅ FIX: Updated route to accept both jobId and revieweeId
router.get('/check/:jobId/:revieweeId', authenticate, checkUserReview);

// Create review
router.post('/', authenticate, createReview);

// Get reviews
router.get('/user/:userId', getUserReviews);
router.get('/job/:jobId', getJobReviews);

// Delete review
router.delete('/:reviewId', authenticate, deleteReview);

module.exports = router;