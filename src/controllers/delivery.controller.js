const Order = require('../models/Order');
const DeliveryEvent = require('../models/DeliveryEvent');
const escrowService = require('../services/escrow.service');
const otpService = require('../services/otp.service');
const notificationService = require('../services/notification.service');
const logger = require('../config/logger');

/**
 * Get Single Order by ID
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(id)
      .populate('product', 'name price images category')
      .populate('seller', 'username email avatar profile.fullName profile.firstName profile.lastName')
      .populate('buyer', 'username email avatar profile.fullName profile.firstName profile.lastName');

    if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });

    // Only allow the buyer or seller to view the order
    if (order.buyer._id.toString() !== userId && order.seller._id.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized' });
    }

    res.status(200).json({ status: 'success', data: { order } });
  } catch (error) {
    logger.error('Error fetching order by id:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Get My Orders (Purchases)
 */
const getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { status } = req.query;
    
    const query = { buyer: userId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('product', 'name price images category')
      .populate('seller', 'username email avatar profile.fullName profile.firstName profile.lastName')
      .sort({ createdAt: -1 });

    res.status(200).json({ status: 'success', data: { orders } });
  } catch (error) {
    logger.error('Error fetching my orders:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Get My Sales (Seller)
 */
const getMySales = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { status } = req.query;
    
    const query = { seller: userId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('product', 'name price images category')
      .populate('buyer', 'username email avatar profile.fullName profile.firstName profile.lastName')
      .sort({ createdAt: -1 });

    res.status(200).json({ status: 'success', data: { orders } });
  } catch (error) {
    logger.error('Error fetching my sales:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Get or regenerate OTP (Buyer Only)
 * Since OTP is hashed, we generate a new one and return it if requested.
 */
const getOrRegenerateOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized: You are not the buyer' });
    }
    
    if (!['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED_CONFIRMED'].includes(order.status)) {
      return res.status(400).json({ status: 'error', message: 'OTP is not available in the current order state.' });
    }

    const otpResult = await otpService.regenerateOtp(id);
    
    res.status(200).json({
      status: 'success',
      data: {
        rawCode: otpResult.rawCode,
        expiresAt: otpResult.otpRecord.expiresAt
      }
    });
  } catch (error) {
    logger.error('Error getting OTP:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Seller marks order as shipped (Seller Only)
 */
const markAsShipped = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
    if (order.seller.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized: You are not the seller' });
    }

    if (order.status !== 'PAID_ESCROW') {
      return res.status(400).json({ status: 'error', message: 'Order cannot be marked as shipped at this stage.' });
    }

    order.status = 'SHIPPED';
    order.shippedAt = new Date();
    
    // Set auto-release deadline to 7 days from now
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    order.autoReleaseDeadline = deadline;

    await order.save();

    // Notify buyer
    await notificationService.sendToUser(
      order.buyer,
      'Order Shipped',
      'Your order has been shipped. Please prepare your OTP for delivery.',
      { screen: 'order_details', orderId: order._id.toString() }
    );

    res.status(200).json({ status: 'success', data: { order } });
  } catch (error) {
    logger.error('Error marking as shipped:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Buyer verifies OTP (Buyer Only)
 */
const verifyDeliveryOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.body;
    const userId = req.user._id.toString();

    if (!code) return res.status(400).json({ status: 'error', message: 'OTP code is required.' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized: You are not the buyer' });
    }

    if (!['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED_CONFIRMED'].includes(order.status)) {
      return res.status(400).json({ status: 'error', message: 'Order is not awaiting delivery confirmation.' });
    }

    const verificationResult = await otpService.verifyOtp(id, code);

    if (verificationResult.success) {
      // Log event
      await DeliveryEvent.create({
        order: id,
        eventType: 'otp_verified',
        actorId: userId
      });

      // Set confirmed timestamp but don't change status yet (escrowService needs it to be SHIPPED/PAID_ESCROW)
      order.deliveredConfirmedAt = new Date();
      await order.save();

      // Release funds (this will change status to RELEASED)
      const releasedOrder = await escrowService.releaseFundsToSeller(id, `buyer:${userId}`);

      // Notify seller
      await notificationService.sendToUser(
        releasedOrder.seller,
        'Funds Released',
        'Delivery confirmed by buyer! Funds have been released to your balance.',
        { screen: 'seller_orders', orderId: releasedOrder._id.toString() }
      );
      
      // Notify buyer
      await notificationService.sendToUser(
        userId,
        'Delivery Confirmed',
        'You have successfully confirmed delivery. Thank you!',
        { screen: 'order_details', orderId: id }
      );

      return res.status(200).json({ status: 'success', message: 'Delivery confirmed and funds released.' });
    } else {
      // Log failed attempt
      await DeliveryEvent.create({
        order: id,
        eventType: 'otp_attempt_failed',
        actorId: userId,
        metadata: { attemptsLeft: verificationResult.attemptsLeft }
      });

      if (verificationResult.reason === 'locked') {
        order.status = 'DISPUTED';
        await order.save();

        // Notify admin queue via topic
        await notificationService.sendToTopic(
          'admin_alerts',
          '🚨 Dispute Opened',
          `Order ${id} locked due to max OTP attempts.`,
          { screen: 'admin_disputes', orderId: id }
        );
      }

      return res.status(400).json({ status: 'error', message: verificationResult.message });
    }
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Buyer rejects delivery (Buyer Only)
 */
const rejectDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id.toString();

    if (!reason) return res.status(400).json({ status: 'error', message: 'Rejection reason is required.' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ status: 'error', message: 'Order not found' });
    if (order.buyer.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized: You are not the buyer' });
    }

    if (!['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(order.status)) {
      return res.status(400).json({ status: 'error', message: 'Order is not awaiting delivery confirmation.' });
    }

    order.status = 'DISPUTED';
    await order.save();

    await DeliveryEvent.create({
      order: id,
      eventType: 'buyer_rejected_item',
      actorId: userId,
      metadata: { reason }
    });

    // Notify seller
    await notificationService.sendToUser(
      order.seller,
      'Delivery Rejected',
      'The buyer has rejected the delivery. The order is now disputed.',
      { screen: 'seller_orders', orderId: order._id.toString() }
    );
    
    // Notify admin
    await notificationService.sendToTopic(
      'admin_alerts',
      '🚨 Delivery Rejected',
      `Buyer rejected delivery for Order ${id}. Reason: ${reason}`,
      { screen: 'admin_disputes', orderId: id }
    );

    res.status(200).json({ status: 'success', message: 'Delivery rejected and order disputed.' });
  } catch (error) {
    logger.error('Error rejecting delivery:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Nudge Seller to Ship (Buyer Only)
 * Sends a push notification to the seller reminding them to ship.
 * Only allowed when order is in PAID_ESCROW status.
 * Has a cooldown stored in-memory to prevent spam.
 */
const nudgeCooldowns = new Map(); // key: orderId, value: timestamp

const nudgeSeller = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    // Check cooldown (1 nudge per 30 minutes per order)
    const lastNudge = nudgeCooldowns.get(id);
    if (lastNudge && (Date.now() - lastNudge) < 30 * 60 * 1000) {
      const minsLeft = Math.ceil((30 * 60 * 1000 - (Date.now() - lastNudge)) / 60000);
      return res.status(429).json({
        status: 'error',
        message: `Please wait ${minsLeft} minute(s) before sending another reminder.`
      });
    }

    const order = await Order.findById(id)
      .populate('product', 'name')
      .populate('seller', 'username');

    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    // Only the buyer can nudge
    if (order.buyer.toString() !== userId && order.buyer._id?.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Only the buyer can send a shipping reminder.' });
    }

    // Only nudge when waiting for shipment
    if (order.status !== 'PAID_ESCROW') {
      return res.status(400).json({
        status: 'error',
        message: 'Reminder can only be sent when the order is awaiting shipment.'
      });
    }

    const productName = order.product?.name || 'an item';

    await notificationService.sendToUser(
      order.seller._id || order.seller,
      '📦 Shipping Reminder',
      `Your buyer is waiting! Please ship "${productName}" as soon as possible.`,
      { screen: 'seller_orders', orderId: order._id.toString() },
      'shipping_reminder'
    );

    // Set cooldown
    nudgeCooldowns.set(id, Date.now());

    res.status(200).json({ status: 'success', message: 'Reminder sent to the seller!' });
  } catch (error) {
    logger.error('Error nudging seller:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

module.exports = {
  getOrderById,
  getMyOrders,
  getMySales,
  getOrRegenerateOtp,
  markAsShipped,
  verifyDeliveryOtp,
  rejectDelivery,
  nudgeSeller
};

