// ============================================================================
// SUBSCRIPTION CONTROLLER
// src/controllers/subscription.controller.js
// ============================================================================

const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Job = require('../models/Job');
const Product = require('../models/Product');
const logger = require('../config/logger');

/**
 * Get all available plans
 */
const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 });
    res.status(200).json({ status: 'success', data: { plans } });
  } catch (error) {
    logger.error('Error fetching plans:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching plans' });
  }
};

/**
 * Subscribe to a plan (initiates MeSomb payment)
 */
const subscribe = async (req, res) => {
  try {
    const { planId, phoneNumber } = req.body;
    const userId = req.user._id;

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ status: 'error', message: 'Plan not found or inactive.' });
    }

    // Check for existing active subscription
    const existing = await Subscription.findOne({ user: userId, status: 'active' });
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'You already have an active subscription. Cancel it first or wait for it to expire.'
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // Create subscription in pending_payment state
    const subscription = await Subscription.create({
      user: userId,
      plan: plan._id,
      status: 'pending_payment',
      startDate,
      endDate,
      amountPaid: plan.price,
      currency: plan.currency
    });

    // Initiate MeSomb payment (same flow as product purchases)
    try {
      const { getMeSombClient, formatPhoneForMeSomb: formatPhone } = require('../services/payment.service');
      const client = getMeSombClient();

      const formattedPhone = formatPhone(phoneNumber);
      const result = await client.makeCollect({
        amount: plan.price,
        service: formattedPhone.startsWith('237') && formattedPhone.charAt(3) === '6' ? 'MTN' : 'ORANGE',
        payer: formattedPhone,
        nonce: `sub_${subscription._id}_${Date.now()}`
      });

      subscription.paymentReference = result.pk || result.id || result.reference;
      subscription.status = 'active';
      await subscription.save();

      res.status(201).json({
        status: 'success',
        message: 'Subscription activated!',
        data: { subscription }
      });
    } catch (payErr) {
      logger.error('Subscription payment failed:', payErr);
      subscription.status = 'cancelled';
      await subscription.save();
      res.status(402).json({ status: 'error', message: 'Payment failed. Subscription not activated.' });
    }
  } catch (error) {
    logger.error('Error subscribing:', error);
    res.status(500).json({ status: 'error', message: 'Error processing subscription' });
  }
};

/**
 * Get my active subscription
 */
const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user: req.user._id,
      status: 'active',
      endDate: { $gte: new Date() }
    }).populate('plan');

    res.status(200).json({
      status: 'success',
      data: { subscription: subscription || null }
    });
  } catch (error) {
    logger.error('Error fetching subscription:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching subscription' });
  }
};

/**
 * Cancel subscription
 */
const cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      { user: req.user._id, status: 'active' },
      { status: 'cancelled', autoRenew: false },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ status: 'error', message: 'No active subscription found.' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Subscription cancelled. It will remain active until the end date.',
      data: { subscription }
    });
  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    res.status(500).json({ status: 'error', message: 'Error cancelling subscription' });
  }
};

/**
 * Boost a listing (job or product)
 */
const boostListing = async (req, res) => {
  try {
    const { listingId, listingType } = req.body; // 'job' or 'product'
    const userId = req.user._id;

    // Check active subscription
    const subscription = await Subscription.findOne({
      user: userId,
      status: 'active',
      endDate: { $gte: new Date() }
    }).populate('plan');

    if (!subscription) {
      return res.status(403).json({ status: 'error', message: 'You need an active subscription to boost listings.' });
    }

    if (subscription.boostedListingsUsed >= subscription.plan.features.maxBoostedListings) {
      return res.status(400).json({ status: 'error', message: 'You have used all your boosted listing slots.' });
    }

    const boostDays = subscription.plan.features.boostDurationDays || 7;
    const boostedUntil = new Date(Date.now() + boostDays * 24 * 60 * 60 * 1000);

    if (listingType === 'job') {
      await Job.findOneAndUpdate(
        { _id: listingId, postedBy: userId },
        { isBoosted: true, boostedUntil }
      );
    } else if (listingType === 'product') {
      await Product.findOneAndUpdate(
        { _id: listingId, seller: userId },
        { isBoosted: true, boostedUntil }
      );
    } else {
      return res.status(400).json({ status: 'error', message: "listingType must be 'job' or 'product'." });
    }

    subscription.boostedListingsUsed += 1;
    await subscription.save();

    res.status(200).json({
      status: 'success',
      message: `Listing boosted until ${boostedUntil.toISOString()}.`,
      data: { boostedUntil, remainingBoosts: subscription.plan.features.maxBoostedListings - subscription.boostedListingsUsed }
    });
  } catch (error) {
    logger.error('Error boosting listing:', error);
    res.status(500).json({ status: 'error', message: 'Error boosting listing' });
  }
};

/**
 * Admin: Create a plan
 */
const createPlan = async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.status(201).json({ status: 'success', data: { plan } });
  } catch (error) {
    logger.error('Error creating plan:', error);
    res.status(500).json({ status: 'error', message: 'Error creating plan' });
  }
};

module.exports = {
  getPlans,
  subscribe,
  getMySubscription,
  cancelSubscription,
  boostListing,
  createPlan
};
