// ============================================================================
// VERIFICATION ROUTES
// src/routes/verification.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const {
  submitVerification,
  getMyVerifications,
  getPendingVerifications,
  reviewVerification
} = require('../controllers/verification.controller');
const { authenticate, adminOnly } = require('../middleware/auth.middleware');

router.use(authenticate);

// User routes
router.post('/', submitVerification);
router.get('/mine', getMyVerifications);

// Admin routes
router.get('/pending', adminOnly, getPendingVerifications);
router.put('/:id/review', adminOnly, reviewVerification);

module.exports = router;
