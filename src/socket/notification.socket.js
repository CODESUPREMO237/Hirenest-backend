const logger = require('../config/logger');
const { sendNotification } = require('../config/firebase');

/**
 * Send notification to user via Socket.IO
 */
const sendSocketNotification = (io, userId, notification) => {
  try {
    const socketId = global.activeUsers?.get(userId.toString());
    
    if (socketId) {
      io.to(socketId).emit('notification:new', notification);
      logger.info(`Socket notification sent to user ${userId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Socket notification error:', error);
    return false;
  }
};

/**
 * Send push notification via FCM
 */
const sendPushNotification = async (user, notification) => {
  try {
    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      return false;
    }

    // Check notification preferences
    if (!user.notificationPreferences?.push) {
      return false;
    }

    const tokens = user.fcmTokens.map(t => t.token);

    const fcmPayload = {
      notification: {
        title: notification.title,
        body: notification.message
      },
      data: {
        type: notification.type,
        id: notification.id?.toString() || '',
        url: notification.url || ''
      }
    };

    // Send to multiple tokens
    for (const token of tokens) {
      try {
        await sendNotification(token, fcmPayload.notification, fcmPayload.data);
      } catch (error) {
        logger.error(`FCM token ${token} failed:`, error);
        // Remove invalid token
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          await user.updateOne({
            $pull: { fcmTokens: { token } }
          });
        }
      }
    }

    return true;
  } catch (error) {
    logger.error('Push notification error:', error);
    return false;
  }
};

/**
 * Notify user (tries Socket.IO first, then FCM)
 */
const notifyUser = async (io, userId, notification, user = null) => {
  try {
    // Try socket notification first
    const socketSent = sendSocketNotification(io, userId, notification);

    // If user is offline, send push notification
    if (!socketSent && user) {
      await sendPushNotification(user, notification);
    }
  } catch (error) {
    logger.error('Notification error:', error);
  }
};

/**
 * Notification handlers
 */
const initializeNotificationHandlers = (io) => {
  // Make io globally accessible for notifications
  global.io = io;

  logger.info('Notification handlers initialized');
};

/**
 * Notify about new application
 */
const notifyNewApplication = async (io, employerId, jobTitle, applicantName) => {
  const notification = {
    type: 'new_application',
    title: 'New Application',
    message: `${applicantName} applied for ${jobTitle}`,
    icon: '📝',
    url: '/employer/applicants'
  };

  const User = require('../models/User');
  const user = await User.findById(employerId);
  
  await notifyUser(io, employerId, notification, user);
};

/**
 * Notify about application status change
 */
const notifyApplicationStatus = async (io, applicantId, jobTitle, status) => {
  const statusMessages = {
    shortlisted: '⭐ You\'ve been shortlisted!',
    interviewing: '📞 Interview scheduled!',
    offered: '🎉 You received a job offer!',
    rejected: '📄 Application update'
  };

  const notification = {
    type: 'application_status',
    title: 'Application Status Update',
    message: `${statusMessages[status]} for ${jobTitle}`,
    icon: statusMessages[status].split(' ')[0],
    url: '/applications'
  };

  const User = require('../models/User');
  const user = await User.findById(applicantId);
  
  await notifyUser(io, applicantId, notification, user);
};

/**
 * Notify about new message
 */
const notifyNewMessage = async (io, userId, senderName, productName) => {
  const notification = {
    type: 'new_message',
    title: 'New Message',
    message: `${senderName} sent you a message about ${productName}`,
    icon: '💬',
    url: '/chats'
  };

  const User = require('../models/User');
  const user = await User.findById(userId);
  
  if (user?.notificationPreferences?.chatMessages) {
    await notifyUser(io, userId, notification, user);
  }
};

/**
 * Notify about order status
 */
const notifyOrderStatus = async (io, userId, orderNumber, status) => {
  const statusMessages = {
    paid: '✅ Payment confirmed',
    processing: '📦 Order is being processed',
    shipped: '🚚 Order has been shipped',
    delivered: '🎉 Order delivered',
    completed: '✨ Order completed'
  };

  const notification = {
    type: 'order_status',
    title: 'Order Update',
    message: `${statusMessages[status]} - Order #${orderNumber}`,
    icon: statusMessages[status].split(' ')[0],
    url: '/orders'
  };

  const User = require('../models/User');
  const user = await User.findById(userId);
  
  await notifyUser(io, userId, notification, user);
};

/**
 * Notify about payment
 */
const notifyPaymentSuccess = async (io, userId, amount, orderNumber) => {
  const notification = {
    type: 'payment_success',
    title: 'Payment Successful',
    message: `Payment of ${amount} XAF confirmed for order #${orderNumber}`,
    icon: '💳',
    url: '/orders'
  };

  const User = require('../models/User');
  const user = await User.findById(userId);
  
  await notifyUser(io, userId, notification, user);
};

/**
 * Notify seller about new order
 */
const notifyNewOrder = async (io, sellerId, productName, buyerName) => {
  const notification = {
    type: 'new_order',
    title: 'New Order',
    message: `${buyerName} ordered your ${productName}`,
    icon: '🛒',
    url: '/seller/orders'
  };

  const User = require('../models/User');
  const user = await User.findById(sellerId);
  
  await notifyUser(io, sellerId, notification, user);
};

module.exports = {
  initializeNotificationHandlers,
  notifyUser,
  sendSocketNotification,
  sendPushNotification,
  notifyNewApplication,
  notifyApplicationStatus,
  notifyNewMessage,
  notifyOrderStatus,
  notifyPaymentSuccess,
  notifyNewOrder
};