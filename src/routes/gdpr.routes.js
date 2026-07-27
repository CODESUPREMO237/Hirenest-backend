// ============================================================================
// GDPR ROUTES
// src/routes/gdpr.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const { exportMyData, deleteMyAccount } = require('../controllers/gdpr.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

/**
 * @route   GET /api/v1/account/export
 * @desc    Export all user data (GDPR)
 * @access  Authenticated
 */
router.get('/export', exportMyData);

/**
 * @route   DELETE /api/v1/account/delete
 * @desc    Permanently delete account and anonymize PII
 * @access  Authenticated
 */
router.delete('/delete', deleteMyAccount);

module.exports = router;
