// ============================================================================
// SUBSCRIPTION ROUTES
// src/routes/subscription.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const {
  getPlans,
  subscribe,
  getMySubscription,
  cancelSubscription,
  boostListing,
  createPlan
} = require('../controllers/subscription.controller');
const { authenticate, adminOnly } = require('../middleware/auth.middleware');

// Public
router.get('/plans', getPlans);

// Authenticated
router.use(authenticate);
router.post('/subscribe', subscribe);
router.get('/mine', getMySubscription);
router.post('/cancel', cancelSubscription);
router.post('/boost', boostListing);

// Admin
router.post('/plans', adminOnly, createPlan);

module.exports = router;
