// ============================================================================
// MESOMB PAYMENT SERVICE WITH DEBUGGING
// src/services/payment.service.js
// ============================================================================
const { PaymentOperation } = require('@hachther/mesomb');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const logger = require('../config/logger');
const { calculateCommission, formatPhoneNumber } = require('../utils/helpers');
const { MESOMB_CURRENCY, PAYMENT_STATUS } = require('../utils/constants');

// MeSomb API Configuration
const MESOMB_APPLICATION_KEY = process.env.MESOMB_APPLICATION_KEY;
const MESOMB_ACCESS_KEY = process.env.MESOMB_ACCESS_KEY;
const MESOMB_SECRET_KEY = process.env.MESOMB_SECRET_KEY;

// ✅ Validation: Check if credentials are set
if (!MESOMB_APPLICATION_KEY || !MESOMB_ACCESS_KEY || !MESOMB_SECRET_KEY) {
  logger.error('CRITICAL: MeSomb credentials not configured!', {
    hasApplicationKey: !!MESOMB_APPLICATION_KEY,
    hasAccessKey: !!MESOMB_ACCESS_KEY,
    hasSecretKey: !!MESOMB_SECRET_KEY
  });
}

/**
 * Format phone to LOCAL format
 */
const formatPhoneForMeSomb = (phoneNumber) => {
  let cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.startsWith('237')) cleaned = cleaned.substring(3);
  if (cleaned.length !== 9 || !cleaned.startsWith('6')) {
    throw new Error('Invalid Cameroon phone number');
  }
  return cleaned;
};

const getMeSombClient = () => {
  return new PaymentOperation({
    applicationKey: MESOMB_APPLICATION_KEY,
    accessKey: MESOMB_ACCESS_KEY,
    secretKey: MESOMB_SECRET_KEY,
  });
};

/**
 * ✅ Create Payment
 */
const createPayment = async (productId, userId, phoneNumber, paymentMethod, idempotencyKey) => {
  try {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const existingOrder = await Order.findOne({ idempotencyKey, buyer: userId });
      if (existingOrder) {
        logger.info(`♻️ Idempotency key match found for ${idempotencyKey}. Returning existing order.`);
        return { 
          success: true, 
          order: existingOrder, 
          mesombData: { reference: existingOrder.orderNumber, status: existingOrder.payment.paymentStatus } 
        };
      }
    }

    // Look up the product
    const product = await Product.findById(productId).populate('seller');
    if (!product) throw new Error('Product not found');
    
    const amount = product.price.amount;
    const productName = product.name;
    const sellerId = product.seller._id;
    
    const calculation = calculateCommission(amount);
    const commission = calculation.commission;
    
    // Shift the fee burden to the buyer:
    // The buyer pays the product price + platform fee.
    // The seller receives the full product price.
    const totalAmountToCharge = amount + commission;
    const sellerAmount = amount;

    // ✅ Format phone
    const localPhone = formatPhoneForMeSomb(phoneNumber);
    const service = paymentMethod.toUpperCase().includes('MTN') ? 'MTN' : 'ORANGE';

    // Create order
    const order = await Order.create({
      buyer: userId,
      seller: sellerId,
      product: productId,
      type: 'purchase',
      productSnapshot: { name: productName },
      pricing: { 
        productPrice: amount, 
        commission, 
        sellerAmount, 
        currency: MESOMB_CURRENCY 
      },
      payment: { 
        method: paymentMethod, 
        paymentStatus: PAYMENT_STATUS.PENDING, 
        phoneNumber: localPhone 
      },
      status: 'pending_payment',
      idempotencyKey: idempotencyKey || undefined
    });

    const client = getMeSombClient();

    logger.info('💳 Creating MeSomb Payment SDK call:', {
      orderNumber: order.orderNumber,
      amount: totalAmountToCharge,
      service,
      payer: `***${localPhone.slice(-4)}`
    });

    // Make request in background so the frontend can receive the orderId instantly
    // and show the "Check your phone" dialog while MeSomb processes it.
    _executeCollectWithPollingFallback(client, {
      amount: totalAmountToCharge,
      service,
      payer: localPhone,
      trxID: order.orderNumber,
      currency: MESOMB_CURRENCY,
      country: 'CM'
    }, order._id);

    // Return immediately so UI can show the modal and start polling!
    return { 
      success: true, 
      order, 
      mesombData: { reference: order.orderNumber, status: 'PENDING' } 
    };

  } catch (error) {
    logger.error('❌ Payment Creation Error:', {
      message: error.message,
      name: error.name,
      responseData: error.response?.data,
      responseStatus: error.response?.status,
      responseHeaders: error.response?.headers,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method
    });
    
    // Add helpful error messages
    if (error.response?.status === 403) {
      logger.error('🚨 403 FORBIDDEN - Possible Issues:', {
        issue1: 'Invalid Application Key, Access Key, or Secret Key',
        issue2: 'Signature mismatch - credentials may be wrong',
        issue3: 'Application may not be activated in MeSomb dashboard',
        solution: 'Double-check your credentials at https://business.mesomb.com'
      });
    }

    // Sanitize MeSomb 500 Internal Server Errors (which return raw HTML)
    if (error.name === 'ServerError' || (error.message && error.message.includes('<html'))) {
      throw new Error('Payment gateway is currently experiencing issues. Please try again later or verify your payment details.');
    }
    
    throw error;
  }
};

/**
 * ✅ Check payment status (called by frontend polling)
 */
const checkPaymentStatus = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');

    // If already completed or failed, just return the status
    if (order.payment.paymentStatus === PAYMENT_STATUS.COMPLETED || order.payment.paymentStatus === PAYMENT_STATUS.FAILED) {
      return { 
        success: true, 
        order, 
        paymentStatus: order.payment.paymentStatus,
        mesombStatus: order.payment.paymentStatus === PAYMENT_STATUS.COMPLETED ? 'SUCCESS' : 'FAILED'
      };
    }

    // If no reference yet, the background task hasn't finished makeCollect
    // (or polling fallback hasn't found the result yet). Just return PENDING.
    if (!order.payment.mesombReference && !order.orderNumber) {
      return { 
        success: true, 
        order, 
        paymentStatus: order.payment.paymentStatus,
        mesombStatus: 'PENDING'
      };
    }

    // Try to query MeSomb directly for the current status
    const client = getMeSombClient();
    const lookupRef = order.payment.mesombReference || order.orderNumber;
    
    logger.info(`🔍 Checking MeSomb status for ref: ${lookupRef}`);
    const transactions = await client.getTransactions([lookupRef]);

    const transaction = Array.isArray(transactions) ? transactions[0] : transactions;
    if (!transaction) {
      // No transaction found yet — still processing
      return { success: true, order, paymentStatus: order.payment.paymentStatus, mesombStatus: 'PENDING' };
    }
    
    logger.info(`✅ Status response:`, transaction);

    // Update order based on MeSomb's response
    if (transaction.status === 'SUCCESS') {
      const ref = transaction.pk || transaction.id || transaction.reference;
      await _finalizeSuccessfulPayment(order._id, ref);
      // Re-fetch for the updated order
      const updatedOrder = await Order.findById(orderId);
      return { success: true, order: updatedOrder, paymentStatus: PAYMENT_STATUS.COMPLETED, mesombStatus: 'SUCCESS' };
    } else if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') {
      order.payment.paymentStatus = PAYMENT_STATUS.FAILED;
      order.status = 'cancelled';
      await order.save();
      return { success: true, order, paymentStatus: PAYMENT_STATUS.FAILED, mesombStatus: transaction.status };
    }

    // Still pending
    return { 
      success: true, 
      order, 
      paymentStatus: order.payment.paymentStatus,
      mesombStatus: transaction.status 
    };

  } catch (error) {
    logger.error('Status check error:', error);
    if (error.name === 'ServerError' || (error.message && error.message.includes('<html'))) {
      throw new Error('Payment gateway is currently experiencing issues. Please try again later.');
    }
    throw error;
  }
};

/**
 * ✅ Process payout
 */
const processPayout = async (sellerId, amount, phoneNumber) => {
  try {
    const localPhone = formatPhoneForMeSomb(phoneNumber);
    const service = localPhone.startsWith('67') ? 'MTN' : 'ORANGE';
    
    const client = getMeSombClient();

    const response = await client.makeDeposit({
      amount: amount,
      receiver: localPhone,
      service: service,
      currency: MESOMB_CURRENCY,
      country: 'CM'
    });

    return { success: true, transaction: response };

  } catch (error) {
    logger.error('Payout error:', error);
    if (error.name === 'ServerError' || (error.message && error.message.includes('<html'))) {
      throw new Error('Payment gateway is currently experiencing issues. Please try again later.');
    }
    throw error;
  }
};

/**
 * ✅ Refund payment
 */
const refundPayment = async (orderId, reason) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');
    
    if (order.payment.paymentStatus !== PAYMENT_STATUS.COMPLETED) {
      throw new Error('Payment not completed, cannot refund');
    }

    const service = order.payment.phoneNumber.startsWith('67') ? 'MTN' : 'ORANGE';
    
    const client = getMeSombClient();

    const response = await client.makeDeposit({
      amount: order.pricing.productPrice,
      receiver: order.payment.phoneNumber,
      service: service,
      currency: MESOMB_CURRENCY,
      country: 'CM'
    });

    // Update order
    order.payment.paymentStatus = PAYMENT_STATUS.REFUNDED;
    order.status = 'refunded';
    order.refund = {
      amount: order.pricing.productPrice,
      reason,
      requestedAt: new Date(),
      processedAt: new Date(),
      status: 'completed'
    };
    await order.save();

    if (order.product) {
      await Product.findByIdAndUpdate(order.product, {
        status: 'active',
        'stock.available': true
      });
    }

    return { success: true, order, transaction: response.data };

  } catch (error) {
    logger.error('Refund error:', error);
    if (error.name === 'ServerError' || (error.message && error.message.includes('<html'))) {
      throw new Error('Payment gateway is currently experiencing issues. Please try again later.');
    }
    throw error;
  }
};

// ============================================================================
// BACKGROUND COLLECT WITH POLLING FALLBACK (Phase 2)
// ============================================================================

/**
 * Shared handler for when a payment is confirmed as successful.
 * Called from both the makeCollect callback and the polling fallback.
 */
const _finalizeSuccessfulPayment = async (orderId, mesombReference) => {
  const order = await Order.findById(orderId);
  if (!order) return;

  // Guard: don't double-finalize
  if (order.payment.paymentStatus === PAYMENT_STATUS.COMPLETED) {
    logger.info(`♻️ Order ${order.orderNumber} already finalized, skipping.`);
    return;
  }

  order.payment.mesombReference = mesombReference;
  order.payment.paymentStatus = PAYMENT_STATUS.COMPLETED;
  order.payment.paidAt = new Date();
  order.status = 'PAID_ESCROW';
  order.escrowHeldAt = new Date();
  await order.save();

  // Write to EscrowLedger
  const escrowService = require('./escrow.service');
  await escrowService.holdFundsInEscrow(order._id, order.pricing.productPrice, 'system');

  // Generate OTP
  const otpService = require('./otp.service');
  const otpResult = await otpService.createOtpForOrder(order._id);

  // Notify buyer with OTP
  const notificationService = require('./notification.service');
  await notificationService.sendToUser(
    order.buyer,
    'Payment Confirmed',
    `Your payment is confirmed. Your delivery OTP is ${otpResult.rawCode}. Show this upon delivery.`,
    { screen: 'order_details', orderId: order._id.toString() },
    'escrow_held'
  );

  // Notify seller to ship
  const product = await Product.findById(order.product);
  if (product) {
    await notificationService.sendToUser(
      product.seller,
      'Item Sold!',
      'A buyer has paid for your item. Please prepare it for shipping.',
      { screen: 'seller_orders', orderId: order._id.toString() },
      'item_sold'
    );
  }

  logger.info(`✅ Order ${order.orderNumber} finalized successfully.`);
};

/**
 * Fire makeCollect. If it succeeds/fails via callback, handle immediately.
 * If it hasn't resolved within 30s, start a polling fallback loop
 * (every 10s, max 12 attempts = ~2 min) to query getTransactions().
 */
const _executeCollectWithPollingFallback = (client, collectParams, orderId) => {
  let resolved = false;

  // 1. Fire the makeCollect call
  client.makeCollect(collectParams)
    .then(async (response) => {
      resolved = true;
      logger.info('✅ MeSomb makeCollect callback succeeded');
      const transaction = response.transaction || response;
      const ref = transaction.pk || transaction.id || transaction.reference;
      await _finalizeSuccessfulPayment(orderId, ref);
    })
    .catch(async (error) => {
      resolved = true;
      logger.error('❌ MeSomb makeCollect callback failed:', error.message);

      // Don't mark as failed immediately if it's a timeout — the polling fallback
      // will check the real status. Only mark failed for definitive errors.
      if (error.name === 'ServerError' || error.message?.includes('<html')) {
        logger.warn('⚠️ MeSomb gateway error — polling fallback will check real status');
        return; // Let the polling fallback handle it
      }

      const order = await Order.findById(orderId);
      if (order && order.payment.paymentStatus === PAYMENT_STATUS.PENDING) {
        order.payment.paymentStatus = PAYMENT_STATUS.FAILED;
        order.status = 'cancelled';
        await order.save();
        logger.info(`❌ Order ${order.orderNumber} marked as FAILED.`);
      }
    });

  // 2. Polling fallback: if makeCollect hasn't resolved in 30s, start polling
  setTimeout(async () => {
    if (resolved) return; // makeCollect already handled it

    logger.info(`⏰ makeCollect hasn't resolved in 30s for order ${orderId}. Starting polling fallback...`);

    const POLL_INTERVAL_MS = 10000; // 10 seconds
    const MAX_POLL_ATTEMPTS = 12;   // ~2 minutes total

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      try {
        // Re-fetch the order to check if makeCollect resolved while we were sleeping
        const order = await Order.findById(orderId);
        if (!order) {
          logger.warn(`⚠️ Polling: Order ${orderId} not found, stopping.`);
          return;
        }

        // If status has been updated by the makeCollect callback, stop polling
        if (order.payment.paymentStatus !== PAYMENT_STATUS.PENDING) {
          logger.info(`✅ Polling: Order ${order.orderNumber} already resolved (${order.payment.paymentStatus}).`);
          return;
        }

        // Query MeSomb for the real transaction status
        logger.info(`🔍 Polling attempt ${attempt}/${MAX_POLL_ATTEMPTS} for order ${order.orderNumber}`);

        try {
          const transactions = await client.getTransactions([order.orderNumber]);
          const transaction = Array.isArray(transactions) ? transactions[0] : transactions;

          if (transaction) {
            if (transaction.status === 'SUCCESS') {
              logger.info(`✅ Polling: Transaction ${order.orderNumber} confirmed SUCCESS!`);
              const ref = transaction.pk || transaction.id || transaction.reference;
              await _finalizeSuccessfulPayment(orderId, ref);
              return;
            } else if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') {
              logger.info(`❌ Polling: Transaction ${order.orderNumber} is ${transaction.status}`);
              order.payment.paymentStatus = PAYMENT_STATUS.FAILED;
              order.status = 'cancelled';
              await order.save();
              return;
            }
            // Status is still PENDING — continue polling
            logger.info(`⏳ Polling: Transaction ${order.orderNumber} still PENDING (attempt ${attempt})`);
          }
        } catch (pollError) {
          logger.warn(`⚠️ Polling query error (attempt ${attempt}):`, pollError.message);
          // Continue polling — transient errors shouldn't stop us
        }

        // Wait before next attempt
        if (attempt < MAX_POLL_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } catch (outerError) {
        logger.error(`❌ Polling outer error (attempt ${attempt}):`, outerError.message);
      }
    }

    // Exhausted all polling attempts — leave as PENDING for the daily reconciliation job (Phase 5)
    logger.warn(`⚠️ Polling exhausted for order ${orderId}. Left as PENDING for reconciliation.`);
  }, 30000); // Start polling after 30s
};

// ============================================================================
// ADDITIONAL FUNCTIONS
// ============================================================================

const getSellerBalance = async (userId) => {
  try {
    const orders = await Order.find({
      seller: userId,
      'payment.paymentStatus': PAYMENT_STATUS.COMPLETED,
      status: { $in: ['paid', 'processing', 'shipped', 'delivered', 'completed', 'RELEASED', 'AUTO_RELEASED', 'RESOLVED_SELLER'] }
    });

    const totalEarnings = orders.reduce((sum, o) => sum + o.pricing.sellerAmount, 0);
    const availableForWithdrawal = orders.reduce((sum, o) => {
      if (['completed', 'RELEASED', 'AUTO_RELEASED', 'RESOLVED_SELLER'].includes(o.status) || o.type === 'deposit') {
        return sum + o.pricing.sellerAmount;
      }
      return sum;
    }, 0);

    return {
      totalEarnings,
      availableForWithdrawal,
      pendingEarnings: totalEarnings - availableForWithdrawal,
      currency: MESOMB_CURRENCY
    };
  } catch (error) {
    logger.error('Balance error:', error);
    throw error;
  }
};

const getTransactionHistory = async (userId, type = 'all') => {
  try {
    let query = { deletedAt: null };
    if (type === 'buyer') query.buyer = userId;
    else if (type === 'seller') query.seller = userId;
    else query.$or = [{ buyer: userId }, { seller: userId }];

    const orders = await Order.find(query)
      .populate('product buyer seller')
      .sort({ createdAt: -1 })
      .limit(50);

    // Map Orders to Transactions for the frontend
    return orders.map(order => {
      const isBuyer = order.buyer?._id.toString() === userId.toString();
      const transactionType = isBuyer ? 'purchase' : 'payment';
      const amount = isBuyer 
        ? order.pricing.productPrice + order.pricing.commission 
        : order.pricing.sellerAmount;

      return {
        _id: order._id,
        id: order._id,
        type: transactionType,
        amount: amount,
        currency: order.pricing.currency,
        status: order.payment?.paymentStatus || 'PENDING',
        description: order.product?.name || order.productSnapshot?.name || 'Order',
        createdAt: order.payment?.paidAt || order.createdAt
      };
    });
  } catch (error) {
    logger.error('Transaction history error:', error);
    throw error;
  }
};

const calculatePlatformRevenue = async (startDate, endDate) => {
  try {
    const orders = await Order.find({
      'payment.paymentStatus': PAYMENT_STATUS.COMPLETED,
      'payment.paidAt': { $gte: startDate, $lte: endDate }
    });

    const totalRevenue = orders.reduce((sum, o) => sum + o.pricing.productPrice, 0);
    const totalCommission = orders.reduce((sum, o) => sum + o.pricing.commission, 0);

    return {
      totalRevenue,
      totalCommission,
      transactionCount: orders.length,
      currency: MESOMB_CURRENCY,
      period: { start: startDate, end: endDate }
    };
  } catch (error) {
    logger.error('Revenue calculation error:', error);
    throw error;
  }
};

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  createPayment,
  checkPaymentStatus,
  processPayout,
  getSellerBalance,
  refundPayment,
  getTransactionHistory,
  calculatePlatformRevenue,
  formatPhoneForMeSomb,
  getMeSombClient,
  _finalizeSuccessfulPayment,
  PAYMENT_STATUS
};