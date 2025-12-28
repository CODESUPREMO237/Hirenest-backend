// ==================== ANALYTICS ROUTES ====================
// src/routes/analytics.routes.js

const express = require('express');
const router = express.Router();

// Import from analytics controller (NOT admin controller)
const {
  getPlatformStats,
  getUserAnalytics,
  getRevenueAnalytics
} = require('../controllers/analytics.controller');

const { authenticate, adminOnly } = require('../middleware/auth.middleware');

/**
 * @route   GET /api/v1/analytics/user
 * @desc    Get user's personal analytics
 * @access  Private
 */
router.get('/user', authenticate, getUserAnalytics);

/**
 * @route   GET /api/v1/analytics/platform
 * @desc    Get platform-wide statistics
 * @access  Admin
 */
router.get('/platform', authenticate, adminOnly, getPlatformStats);

/**
 * @route   GET /api/v1/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Admin
 */
router.get('/revenue', authenticate, adminOnly, getRevenueAnalytics);

module.exports = router;