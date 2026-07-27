const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { otpRateLimiter } = require('../middleware/rateLimiter.middleware');
const deliveryController = require('../controllers/delivery.controller');

const router = express.Router({ mergeParams: true });

// All delivery routes require authentication
router.use(authenticate);

// Named routes MUST come before /:id wildcard
// Get My Orders and My Sales
router.get('/my-orders', deliveryController.getMyOrders);
router.get('/my-sales', deliveryController.getMySales);

// Get single order by ID (wildcard — must be after named routes)
router.get('/:id', deliveryController.getOrderById);


// Get or regenerate OTP (Buyer Only)
// Applied custom rate limiting keyed by user+order to prevent CGNAT IP lockouts
router.get('/:id/delivery/otp', otpRateLimiter, deliveryController.getOrRegenerateOtp);

// Buyer verifies delivery via OTP
router.post('/:id/delivery/verify-otp', deliveryController.verifyDeliveryOtp);

// Buyer rejects delivery
router.post('/:id/delivery/reject', deliveryController.rejectDelivery);

// Seller marks order as shipped
router.post('/:id/ship', deliveryController.markAsShipped);

// Buyer nudges seller to ship
router.post('/:id/nudge-seller', deliveryController.nudgeSeller);

module.exports = router;
