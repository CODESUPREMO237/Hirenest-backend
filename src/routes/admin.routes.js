// ==================== ADMIN ROUTES ====================
// src/routes/admin.routes.js

const express = require('express');
const router = express.Router();
const {
  getDashboardOverview,
  getAllUsers,
  toggleUserBlock,
  deleteUser,
  moderateJob,
  moderateProduct,
  getReportedContent
} = require('../controllers/admin.controller');

const { authenticate, adminOnly } = require('../middleware/auth.middleware');

// All routes require admin access
router.use(authenticate);
router.use(adminOnly);

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Get admin dashboard overview
 * @access  Admin
 */
router.get('/dashboard', getDashboardOverview);

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users with filters
 * @access  Admin
 */
router.get('/users', getAllUsers);

/**
 * @route   PUT /api/v1/admin/users/:userId/toggle-block
 * @desc    Block or unblock user
 * @access  Admin
 */
router.put('/users/:userId/toggle-block', toggleUserBlock);

/**
 * @route   DELETE /api/v1/admin/users/:userId
 * @desc    Delete user
 * @access  Admin
 */
router.delete('/users/:userId', deleteUser);

/**
 * @route   PUT /api/v1/admin/jobs/:jobId/moderate
 * @desc    Moderate job posting
 * @access  Admin
 */
router.put('/jobs/:jobId/moderate', moderateJob);

/**
 * @route   PUT /api/v1/admin/products/:productId/moderate
 * @desc    Moderate product listing
 * @access  Admin
 */
router.put('/products/:productId/moderate', moderateProduct);

/**
 * @route   GET /api/v1/admin/reported
 * @desc    Get reported content
 * @access  Admin
 */
router.get('/reported', getReportedContent);

module.exports = router;
