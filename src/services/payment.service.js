// ============================================================================
// MESOMB PAYMENT SERVICE WITH DEBUGGING
// src/services/payment.service.js
// ============================================================================
const axios = require('axios');
const crypto = require('crypto');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const logger = require('../config/logger');
const { calculateCommission, formatPhoneNumber } = require('../utils/helpers');
const { MESOMB_CURRENCY, PAYMENT_STATUS } = require('../utils/constants');

// MeSomb API Configuration
const MESOMB_API_URL = 'https://mesomb.hachther.com';
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

/**
 * Generate Nonce
 */
const generateNonce = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * ✅ Generate MeSomb Signature
 * Format: HMAC-SHA1(SECRET_KEY, METHOD + URL + TIMESTAMP + NONCE + BODY)
 */
const generateMeSombSignature = (method, url, timestamp, nonce, body = '') => {
  const signatureData = `${method}${url}${timestamp}${nonce}${body}`;
  
  const signature = crypto
    .createHmac('sha1', MESOMB_SECRET_KEY)
    .update(signatureData)
    .digest('hex');
  
  logger.info('🔐 MeSomb Signature Generation:', {
    method,
    url,
    timestamp,
    nonce,
    bodyLength: body.length,
    // Security: Only log first/last chars of sensitive data
    secretKeyPreview: `${MESOMB_SECRET_KEY.substring(0, 4)}...${MESOMB_SECRET_KEY.slice(-4)}`,
    signatureDataPreview: `${signatureData.substring(0, 50)}...`,
    signature
  });
  
  return signature;
};

/**
 * ✅ Creates MeSomb Headers
 */
const getMeSombHeaders = (method, endpoint, nonce, timestamp, body = null) => {
  const bodyString = body ? JSON.stringify(body) : '';
  
  const signature = generateMeSombSignature(
    method,
    endpoint,
    timestamp,
    nonce,
    bodyString
  );

  const headers = {
    'X-MeSomb-Application': MESOMB_APPLICATION_KEY,
    'X-MeSomb-AccessKey': MESOMB_ACCESS_KEY,
    'X-MeSomb-Timestamp': timestamp.toString(),
    'X-MeSomb-Nonce': nonce,
    'X-MeSomb-Signature': signature,
    'Content-Type': 'application/json',
  };

  logger.info('📤 Request Headers:', {
    'X-MeSomb-Application': `${MESOMB_APPLICATION_KEY.substring(0, 8)}...`,
    'X-MeSomb-AccessKey': `${MESOMB_ACCESS_KEY.substring(0, 8)}...`,
    'X-MeSomb-Timestamp': headers['X-MeSomb-Timestamp'],
    'X-MeSomb-Nonce': headers['X-MeSomb-Nonce'],
    'X-MeSomb-Signature': headers['X-MeSomb-Signature']
  });

  return headers;
};

/**
 * ✅ Create Payment
 */
const createPayment = async (productId, userId, phoneNumber, paymentMethod, manualAmount, type = 'purchase') => {
  try {
    let amount, productName, sellerId, commission = 0, sellerAmount = 0;

    // Determine payment details
    if (type === 'deposit') {
      amount = parseFloat(manualAmount);
      if (isNaN(amount) || amount < 100) {
        throw new Error('Invalid deposit amount (minimum 100 XAF)');
      }
      productName = "Wallet Top-up";
      sellerId = userId;
      sellerAmount = amount;
    } else {
      const product = await Product.findById(productId).populate('seller');
      if (!product) throw new Error('Product not found');
      
      amount = product.price.amount;
      productName = product.name;
      sellerId = product.seller._id;
      
      const calculation = calculateCommission(amount);
      commission = calculation.commission;
      sellerAmount = calculation.sellerAmount;
    }

    // ✅ Format phone
    const localPhone = formatPhoneForMeSomb(phoneNumber);
    const service = paymentMethod.toUpperCase().includes('MTN') ? 'MTN' : 'ORANGE';

    // Create order
    const order = await Order.create({
      buyer: userId,
      seller: sellerId,
      product: type === 'purchase' ? productId : null,
      type,
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
      status: 'pending_payment'
    });

    // ✅ Generate nonce ONCE
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const endpoint = '/api/v1.1/payment/collect/';

    // ✅ Payment data
    const paymentData = {
      nonce: nonce, // SAME nonce
      amount: amount,
      service: service,
      payer: localPhone,
      trxID: order.orderNumber,
      currency: MESOMB_CURRENCY,
      country: 'CM'
    };

    logger.info('💳 Creating MeSomb Payment:', {
      endpoint,
      orderNumber: order.orderNumber,
      timestamp,
      nonce,
      paymentData: {
        ...paymentData,
        payer: `***${localPhone.slice(-4)}`
      },
      credentials: {
        applicationKey: `${MESOMB_APPLICATION_KEY.substring(0, 8)}...`,
        accessKey: `${MESOMB_ACCESS_KEY.substring(0, 8)}...`,
        secretKeyLength: MESOMB_SECRET_KEY?.length
      }
    });

    // ✅ Generate headers with SAME nonce
    const headers = getMeSombHeaders('POST', endpoint, nonce, timestamp, paymentData);

    logger.info('🌐 Full Request Details:', {
      url: `${MESOMB_API_URL}${endpoint}`,
      method: 'POST',
      headersCount: Object.keys(headers).length,
      bodySize: JSON.stringify(paymentData).length
    });

    // Make request
    const response = await axios.post(
      `${MESOMB_API_URL}${endpoint}`,
      paymentData,
      { headers }
    );

    logger.info('✅ MeSomb Payment Success:', response.data);

    // Update order
    order.payment.mesombReference = response.data.transaction?.pk || response.data.reference;
    order.payment.paymentStatus = PAYMENT_STATUS.PROCESSING;
    order.status = 'payment_processing';
    await order.save();

    return { 
      success: true, 
      order, 
      mesombData: response.data 
    };

  } catch (error) {
    logger.error('❌ Payment Creation Error:', {
      message: error.message,
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
    
    throw error;
  }
};

/**
 * ✅ Check payment status
 */
const checkPaymentStatus = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');

    if (!order.payment.mesombReference) {
      throw new Error('No MeSomb reference found');
    }

    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const endpoint = `/api/v1.1/payment/transactions/?ids=${order.payment.mesombReference}`;
    
    const headers = getMeSombHeaders('GET', endpoint, nonce, timestamp);

    const response = await axios.get(
      `${MESOMB_API_URL}${endpoint}`,
      { headers }
    );

    const transaction = response.data[0];
    if (!transaction) throw new Error('Transaction not found');

    // Update order based on status
    if (transaction.status === 'SUCCESS') {
      order.payment.paymentStatus = PAYMENT_STATUS.COMPLETED;
      order.payment.paidAt = new Date();
      order.status = order.type === 'deposit' ? 'completed' : 'paid';

      if (order.type === 'deposit') {
        await User.findByIdAndUpdate(order.buyer, {
          $inc: { 'wallet.balance': order.pricing.productPrice }
        });
      }

      await order.save();
    } else if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') {
      order.payment.paymentStatus = PAYMENT_STATUS.FAILED;
      order.status = 'cancelled';
      await order.save();
    }

    return { 
      success: true, 
      order, 
      paymentStatus: order.payment.paymentStatus,
      mesombStatus: transaction.status 
    };

  } catch (error) {
    logger.error('Status check error:', error);
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
    
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const endpoint = '/api/v1.1/payment/deposit/';
    
    const payoutData = {
      nonce: nonce,
      amount: amount,
      receiver: localPhone,
      service: service,
      currency: MESOMB_CURRENCY,
      country: 'CM'
    };

    const headers = getMeSombHeaders('POST', endpoint, nonce, timestamp, payoutData);

    const response = await axios.post(
      `${MESOMB_API_URL}${endpoint}`,
      payoutData,
      { headers }
    );

    return { success: true, transaction: response.data };

  } catch (error) {
    logger.error('Payout error:', error);
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
    
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const endpoint = '/api/v1.1/payment/deposit/';

    const refundData = {
      nonce: nonce,
      amount: order.pricing.productPrice,
      receiver: order.payment.phoneNumber,
      service: service,
      currency: MESOMB_CURRENCY,
      country: 'CM'
    };

    const headers = getMeSombHeaders('POST', endpoint, nonce, timestamp, refundData);

    const response = await axios.post(
      `${MESOMB_API_URL}${endpoint}`,
      refundData,
      { headers }
    );

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
    throw error;
  }
};

// ============================================================================
// ADDITIONAL FUNCTIONS
// ============================================================================

const getSellerBalance = async (userId) => {
  try {
    const orders = await Order.find({
      seller: userId,
      'payment.paymentStatus': PAYMENT_STATUS.COMPLETED,
      status: { $in: ['paid', 'processing', 'shipped', 'delivered', 'completed'] }
    });

    const totalEarnings = orders.reduce((sum, o) => sum + o.pricing.sellerAmount, 0);
    const availableForWithdrawal = orders.reduce((sum, o) => {
      if (o.status === 'completed' || o.type === 'deposit') {
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

    return await Order.find(query)
      .populate('product buyer seller')
      .sort({ createdAt: -1 })
      .limit(50);
  } catch (error) {
    logger.error('Transaction history error:', error);
    throw error;
  }
};

const validateWebhook = (payload, signature) => {
  logger.info('Webhook received:', payload);
  return true;
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
  validateWebhook,
  calculatePlatformRevenue,
  formatPhoneForMeSomb
};