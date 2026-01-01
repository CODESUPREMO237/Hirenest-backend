const express = require('express');
const router = express.Router();
const { 
  createReview, 
  getUserReviews, 
  getJobReviews, 
  deleteReview 
} = require('../controllers/reviewController');

// ✅ FIX: Use 'authenticate' instead of 'protect'
const { authenticate } = require('../middleware/auth.middleware');

// Routes
router.post('/', authenticate, createReview); // Changed from protect to authenticate
router.get('/user/:userId', getUserReviews);
router.get('/job/:jobId', getJobReviews);
router.delete('/:reviewId', authenticate, deleteReview); // Changed from protect to authenticate

module.exports = router;