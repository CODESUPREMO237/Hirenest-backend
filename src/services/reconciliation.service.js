// ============================================================================
// RECONCILIATION SERVICE
// src/services/reconciliation.service.js
// ============================================================================

const Order = require('../models/Order');
const logger = require('../config/logger');
const { getMeSombClient, PAYMENT_STATUS } = require('./payment.service');

/**
 * Reconcile pending payments that are older than X minutes.
 * This acts as the ultimate safety net if webhooks and active polling both fail.
 */
const reconcilePendingPayments = async () => {
  logger.info('🔄 Starting daily payment reconciliation job...');

  try {
    // Find orders that are still pending payment and were created more than 15 minutes ago
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    const pendingOrders = await Order.find({
      'payment.paymentStatus': PAYMENT_STATUS.PENDING,
      createdAt: { $lte: fifteenMinsAgo },
      $or: [
        { 'payment.mesombReference': { $exists: true, $ne: null } },
        { orderNumber: { $exists: true } }
      ]
    });

    if (pendingOrders.length === 0) {
      logger.info('✅ No pending orders to reconcile.');
      return;
    }

    logger.info(`🔍 Found ${pendingOrders.length} stuck pending orders. Checking with MeSomb...`);
    const client = getMeSombClient();

    let reconciledCount = 0;
    let failedCount = 0;
    let stillPendingCount = 0;

    for (const order of pendingOrders) {
      const lookupRef = order.payment.mesombReference || order.orderNumber;
      
      try {
        const transactions = await client.getTransactions([lookupRef]);
        const transaction = Array.isArray(transactions) ? transactions[0] : transactions;

        if (!transaction) {
          logger.warn(`⚠️ No transaction found on MeSomb for order ${order._id} (ref: ${lookupRef})`);
          continue;
        }

        if (transaction.status === 'SUCCESS') {
          const ref = transaction.pk || transaction.id || transaction.reference;
          // IMPORTANT: Import dynamically or use the exported one to avoid circular deps
          // if payment.service requires this service
          const paymentService = require('./payment.service');
          
          if (typeof paymentService._finalizeSuccessfulPayment === 'function') {
            await paymentService._finalizeSuccessfulPayment(order._id, ref);
          } else {
             // Fallback if not exported
             order.payment.paymentStatus = PAYMENT_STATUS.COMPLETED;
             order.status = 'PAID_ESCROW';
             await order.save();
          }
          
          reconciledCount++;
          logger.info(`✅ Reconciled order ${order._id} as SUCCESS`);
        } else if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') {
          order.payment.paymentStatus = PAYMENT_STATUS.FAILED;
          order.status = 'cancelled';
          await order.save();
          failedCount++;
          logger.info(`❌ Reconciled order ${order._id} as FAILED`);
        } else {
          stillPendingCount++;
        }
      } catch (err) {
        logger.error(`Error reconciling order ${order._id}:`, err.message);
      }
    }

    logger.info(`🏁 Reconciliation complete. Success: ${reconciledCount}, Failed: ${failedCount}, Still Pending: ${stillPendingCount}`);

  } catch (error) {
    logger.error('❌ Reconciliation job crashed:', error);
  }
};

module.exports = {
  reconcilePendingPayments
};
