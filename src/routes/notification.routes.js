// ==================== NOTIFICATION ROUTES ====================
// src/routes/notification.routes.js

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { 
  sendTestNotification,
  sendNotificationToUser,
  sendNotificationToMultipleUsers,
  sendNotificationToTopic,
  subscribeToTopic,
  unsubscribeFromTopic
} = require('../services/notification.service');
const logger = require('../config/logger');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/notifications/test
 * @desc    Send a test notification to the current user
 * @access  Private
 */
router.post('/test', async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, body } = req.body;

    const result = await sendTestNotification(
      userId,
      title || 'Test Notification',
      body || 'This is a test notification from JobConnect!'
    );

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: 'Test notification sent successfully',
        data: result
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.message || 'Failed to send notification'
      });
    }
  } catch (error) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error sending test notification'
    });
  }
});

/**
 * @route   POST /api/v1/notifications/send
 * @desc    Send notification to specific user (admin only for now)
 * @access  Private
 */
router.post('/send', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        status: 'error',
        message: 'userId, title, and body are required'
      });
    }

    const result = await sendNotificationToUser(userId, title, body, data);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: 'Notification sent successfully',
        data: result
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.message || 'Failed to send notification'
      });
    }
  } catch (error) {
    logger.error('Error sending notification:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error sending notification'
    });
  }
});

/**
 * @route   POST /api/v1/notifications/subscribe/:topic
 * @desc    Subscribe to a notification topic
 * @access  Private
 */
router.post('/subscribe/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const userId = req.user._id;

    const result = await subscribeToTopic(userId, topic);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: `Subscribed to ${topic} successfully`,
        data: result
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.message || 'Failed to subscribe to topic'
      });
    }
  } catch (error) {
    logger.error('Error subscribing to topic:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error subscribing to topic'
    });
  }
});

/**
 * @route   POST /api/v1/notifications/unsubscribe/:topic
 * @desc    Unsubscribe from a notification topic
 * @access  Private
 */
router.post('/unsubscribe/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const userId = req.user._id;

    const result = await unsubscribeFromTopic(userId, topic);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: `Unsubscribed from ${topic} successfully`,
        data: result
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.message || 'Failed to unsubscribe from topic'
      });
    }
  } catch (error) {
    logger.error('Error unsubscribing from topic:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error unsubscribing from topic'
    });
  }
});

module.exports = router;