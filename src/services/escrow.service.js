const Order = require('../models/Order');
const EscrowLedger = require('../models/EscrowLedger');
const User = require('../models/User');
const Product = require('../models/Product');
const logger = require('../config/logger');
const paymentService = require('./payment.service'); // for programmatic refunds

/**
 * Create initial escrow hold ledger entry
 */
const holdFundsInEscrow = async (orderId, amount, actor = 'system') => {
  try {
    const ledgerEntry = await EscrowLedger.create({
      order: orderId,
      eventType: 'held',
      amount,
      balanceBefore: 0,
      balanceAfter: amount,
      actor,
      note: 'Funds held in escrow upon payment confirmation.'
    });
    return ledgerEntry;
  } catch (error) {
    logger.error('Error holding funds in escrow:', error);
    throw error;
  }
};

/**
 * Release funds to seller
 */
const releaseFundsToSeller = async (orderId, actor = 'system', note = 'Delivery confirmed, funds released.') => {
  try {
    // 1. Find the order and atomically update its status if it's currently in an escrow state
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId, 
        status: { $in: ['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED_CONFIRMED'] } 
      },
      { 
        status: 'RELEASED',
        releasedAt: new Date()
      },
      { new: true }
    );

    if (!order) {
      throw new Error('Order not found or not in a releasable state. It might have already been released.');
    }

    // 2. Write to EscrowLedger
    // Find the total held amount for this order (usually just the one 'held' event, but sum is safer)
    const heldEvents = await EscrowLedger.find({ order: orderId, eventType: 'held' });
    const totalHeld = heldEvents.reduce((sum, e) => sum + e.amount, 0);

    const releasedEvents = await EscrowLedger.find({ order: orderId, eventType: 'released' });
    const totalReleased = releasedEvents.reduce((sum, e) => sum + e.amount, 0);
    
    const availableAmount = totalHeld - totalReleased;
    
    if (availableAmount <= 0) {
      logger.warn(`Attempted to release funds for order ${orderId} but available escrow balance is 0.`);
      return order; // Already released, perhaps concurrency bypassed the first check
    }

    await EscrowLedger.create({
      order: orderId,
      eventType: 'released',
      amount: order.pricing.sellerAmount, // Only release the seller's portion
      balanceBefore: availableAmount,
      balanceAfter: availableAmount - order.pricing.sellerAmount,
      actor,
      note
    });

    // Commission logic can also be logged here if needed, but for now we just log the seller release.

    return order;
  } catch (error) {
    logger.error('Error releasing funds:', error);
    throw error;
  }
};

/**
 * Process programmatic refund for buyer
 */
const refundBuyer = async (orderId, actor = 'system', reason = 'Dispute resolved in favor of buyer') => {
  try {
    const order = await Order.findOneAndUpdate(
      { 
        _id: orderId, 
        status: 'DISPUTED' 
      },
      { 
        status: 'RESOLVED_BUYER'
      },
      { new: true }
    );

    if (!order) {
      throw new Error('Order not found or not in DISPUTED state.');
    }

    // Attempt the actual Mobile Money refund via MeSomb
    const refundResult = await paymentService.refundPayment(orderId, reason);
    
    if (refundResult.success) {
      await EscrowLedger.create({
        order: orderId,
        eventType: 'refunded',
        amount: order.pricing.productPrice,
        balanceBefore: order.pricing.productPrice,
        balanceAfter: 0,
        actor,
        note: reason
      });
    }

    return order;
  } catch (error) {
    logger.error('Error refunding buyer:', error);
    throw error;
  }
};

/**
 * Process auto-releases for expired escrows
 */
const processAutoReleases = async () => {
  try {
    // Find orders that are shipped and deadline has passed
    const now = new Date();
    const expiredOrders = await Order.find({
      status: { $in: ['SHIPPED', 'OUT_FOR_DELIVERY'] },
      autoReleaseDeadline: { $lte: now }
    });

    if (expiredOrders.length === 0) return;

    logger.info(`Found ${expiredOrders.length} orders for auto-release.`);

    for (const order of expiredOrders) {
      try {
        // Atomic update to prevent concurrent double release
        const updatedOrder = await Order.findOneAndUpdate(
          { _id: order._id, status: { $in: ['SHIPPED', 'OUT_FOR_DELIVERY'] } },
          { status: 'AUTO_RELEASED', releasedAt: new Date() },
          { new: true }
        );

        if (!updatedOrder) continue;

        // Release funds
        const heldEvents = await EscrowLedger.find({ order: order._id, eventType: 'held' });
        const totalHeld = heldEvents.reduce((sum, e) => sum + e.amount, 0);

        const releasedEvents = await EscrowLedger.find({ order: order._id, eventType: 'released' });
        const totalReleased = releasedEvents.reduce((sum, e) => sum + e.amount, 0);
        
        const availableAmount = totalHeld - totalReleased;
        
        if (availableAmount > 0) {
          await EscrowLedger.create({
            order: order._id,
            eventType: 'released',
            amount: updatedOrder.pricing.sellerAmount,
            balanceBefore: availableAmount,
            balanceAfter: availableAmount - updatedOrder.pricing.sellerAmount,
            actor: 'system',
            note: 'Auto-released after deadline passed without dispute.'
          });
        }

        // Notify seller
        const notificationService = require('./notification.service');
        await notificationService.sendToUser(
          updatedOrder.seller,
          'Funds Auto-Released',
          'The delivery confirmation window expired. Funds have been automatically released to your balance.',
          { screen: 'seller_orders', orderId: updatedOrder._id.toString() }
        );
        
        // Notify buyer
        await notificationService.sendToUser(
          updatedOrder.buyer,
          'Order Auto-Confirmed',
          'The confirmation window for your order expired. The order has been marked as confirmed.',
          { screen: 'order_details', orderId: updatedOrder._id.toString() }
        );

      } catch (err) {
        logger.error(`Failed to auto-release order ${order._id}:`, err);
      }
    }
  } catch (error) {
    logger.error('Error processing auto-releases:', error);
  }
};

/**
 * Resolve a dispute in favor of the seller — release funds directly from DISPUTED state
 */
const resolveDisputeToSeller = async (orderId, actor = 'system', note = 'Dispute resolved in favor of seller.') => {
  try {
    // 1. Atomically update DISPUTED → RESOLVED_SELLER
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: 'DISPUTED' },
      { status: 'RESOLVED_SELLER', releasedAt: new Date() },
      { new: true }
    );

    if (!order) {
      throw new Error('Order not found or not in DISPUTED state.');
    }

    // 2. Write to EscrowLedger
    const heldEvents = await EscrowLedger.find({ order: orderId, eventType: 'held' });
    const totalHeld = heldEvents.reduce((sum, e) => sum + e.amount, 0);

    const releasedEvents = await EscrowLedger.find({ order: orderId, eventType: 'released' });
    const totalReleased = releasedEvents.reduce((sum, e) => sum + e.amount, 0);

    const availableAmount = totalHeld - totalReleased;

    if (availableAmount > 0) {
      await EscrowLedger.create({
        order: orderId,
        eventType: 'released',
        amount: order.pricing.sellerAmount,
        balanceBefore: availableAmount,
        balanceAfter: availableAmount - order.pricing.sellerAmount,
        actor,
        note
      });
    }

    return order;
  } catch (error) {
    logger.error('Error resolving dispute to seller:', error);
    throw error;
  }
};

module.exports = {
  holdFundsInEscrow,
  releaseFundsToSeller,
  refundBuyer,
  resolveDisputeToSeller,
  processAutoReleases
};
