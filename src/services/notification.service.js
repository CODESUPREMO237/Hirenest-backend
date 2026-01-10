// ============================================================================
// services/notification.service.js
// Complete Push Notification Service - ONLY SENDS TO USERS WITH PUSH ENABLED
// ============================================================================

const admin = require('firebase-admin');
const User = require('../models/User');
const logger = require('../config/logger');



/**
 * Helper: Build deep link URL for mobile app
 */
const buildDeepLink = (screen, params = {}) => {
  const baseUrl = process.env.APP_URL || process.env.CLIENT_URL || 'com.jobconnect://';
  
  // Remove trailing slashes
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  // Build query string if params exist
  const queryString = Object.keys(params).length > 0
    ? '?' + Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&')
    : '';
  
  return `${cleanBaseUrl}/${screen}${queryString}`;
};

/**
 * Helper: Send notification to specific user (checks preferences)
 * ✅ ONLY SENDS IF USER HAS ENABLED PUSH NOTIFICATIONS
 */
const sendToUser = async (userId, title, body, data = {}, type = 'general') => {
  try {
    const user = await User.findById(userId).select('fcmTokens notificationPreferences');
    
    if (!user) {
      logger.warn(`User ${userId} not found for notification`);
      return { success: false, reason: 'user_not_found' };
    }

    // ✅ CRITICAL CHECK: Only send if push notifications are enabled
    if (!user.notificationPreferences?.push) {
      logger.info(`Push notifications disabled for user ${userId}`);
      return { success: false, reason: 'push_disabled' };
    }

    // Check if user has FCM tokens
    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      logger.warn(`No FCM tokens for user ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }

    const tokens = user.fcmTokens.map(t => t.token);
    
    const message = {
      notification: {
        title,
        body
      },
      data: {
        type,
        timestamp: new Date().toISOString(),
        ...data
      },
      tokens
    };

    const response = await admin.messaging().sendMulticast(message);
    
    // Remove invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      
      await User.findByIdAndUpdate(userId, {
        $pull: { fcmTokens: { token: { $in: failedTokens } } }
      });
      
      logger.info(`Removed ${failedTokens.length} invalid tokens for user ${userId}`);
    }

    logger.info(`✅ Notification sent to user ${userId}: ${response.successCount}/${tokens.length} successful`);
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    logger.error('Error sending notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Helper: Send notification to topic subscribers
 */
const sendToTopic = async (topic, title, body, data = {}, type = 'general') => {
  try {
    const message = {
      notification: { title, body },
      data: {
        type,
        timestamp: new Date().toISOString(),
        ...data
      },
      topic
    };

    const response = await admin.messaging().send(message);
    logger.info(`✅ Topic notification sent to ${topic}: ${response}`);
    
    return { success: true, messageId: response };
  } catch (error) {
    logger.error(`Error sending notification to topic ${topic}:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// 1. JOB APPLICATION NOTIFICATIONS
// ============================================================================

/**
 * Notify employer when someone applies to their job
 */
const notifyNewApplication = async (employerId, jobTitle, applicantName) => {
  return await sendToUser(
    employerId,
    '🎯 New Application Received',
    `${applicantName} applied for ${jobTitle}`,
    {
      screen: 'applications',
      route: '/employer/applicants',
      deepLink: buildDeepLink('applications'),
      jobTitle
    },
    'new_application'
  );
};

/**
 * Notify applicant when application status changes
 */
const notifyApplicationStatus = async (applicantId, jobTitle, status) => {
  const statusMessages = {
    reviewing: `Your application for ${jobTitle} is being reviewed`,
    shortlisted: `Great news! You've been shortlisted for ${jobTitle}`,
    interviewing: `Interview scheduled for ${jobTitle}`,
    offered: `🎉 Congratulations! You received an offer for ${jobTitle}`,
    accepted: `Your acceptance for ${jobTitle} has been confirmed`,
    rejected: `Update on your application for ${jobTitle}`,
    position_filled: `The position for ${jobTitle} has been filled`,
    position_closed: `The position for ${jobTitle} is no longer accepting applications`
  };

  const statusEmojis = {
    reviewing: '👀',
    shortlisted: '⭐',
    interviewing: '📅',
    offered: '🎉',
    accepted: '✅',
    rejected: '📝',
    position_filled: '✔️',
    position_closed: '🔒'
  };

  return await sendToUser(
    applicantId,
    `${statusEmojis[status] || '📋'} Application Update`,
    statusMessages[status] || `Your application status has changed to ${status}`,
    {
      screen: 'my_applications',
      route: '/applications',
      deepLink: buildDeepLink('my_applications'),
      status,
      jobTitle
    },
    'application_status'
  );
};

/**
 * Notify when receiving a chat message
 */
const notifyNewMessage = async (recipientId, senderName, chatId) => {
  return await sendToUser(
    recipientId,
    `💬 New message from ${senderName}`,
    'Tap to view message',
    {
      screen: 'chat',
      route: `/messages/${chatId}`,
      deepLink: buildDeepLink('messages', { chatId }),
      chatId
    },
    'new_message'
  );
};

/**
 * Notify job seekers about new job (via topic)
 */
const notifyNewJobPosted = async (jobTitle, companyName, category, jobId) => {
  const sendToTopic = async (topic, title, body, data = {}, type = 'general') => {
    try {
      const message = {
        notification: { title, body },
        data: {
          type,
          timestamp: new Date().toISOString(),
          ...data
        },
        topic
      };

      const response = await admin.messaging().send(message);
      logger.info(`✅ Topic notification sent to ${topic}: ${response}`);
      
      return { success: true, messageId: response };
    } catch (error) {
      logger.error(`Error sending notification to topic ${topic}:`, error);
      return { success: false, error: error.message };
    }
  };

  return await sendToTopic(
    'job_alerts',
    '🆕 New Job Posted',
    `${companyName} is hiring: ${jobTitle}`,
    {
      screen: 'job_details',
      route: `/jobs/${jobId}`,
      deepLink: buildDeepLink('jobs', { jobId }),
      jobId,
      category
    },
    'new_job'
  );
};

/**
 * Notify applicants when job status changes
 */
const notifyJobStatusChange = async (applicantIds, jobTitle, newStatus) => {
  const statusMessages = {
    closed: `The position "${jobTitle}" has been closed`,
    filled: `The position "${jobTitle}" has been filled`,
    paused: `The position "${jobTitle}" is temporarily paused`
  };

  const message = statusMessages[newStatus] || `Job status updated for ${jobTitle}`;

  const results = [];
  for (const applicantId of applicantIds) {
    const result = await sendToUser(
      applicantId,
      '📢 Job Status Update',
      message,
      {
        screen: 'my_applications',
        jobTitle,
        newStatus
      },
      'job_status_change'
    );
    results.push(result);
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Job status change notifications: ${successCount}/${applicantIds.length} sent`);

  return {
    success: successCount > 0,
    successCount,
    failureCount: applicantIds.length - successCount
  };
};

// ============================================================================
// 4. INTERVIEW NOTIFICATIONS
// ============================================================================

/**
 * Notify about interview invitation
 */
const notifyInterviewScheduled = async (applicantId, jobTitle, interviewDate) => {
  return await sendToUser(
    applicantId,
    '📅 Interview Scheduled!',
    `You have an interview for ${jobTitle}`,
    {
      screen: 'my_applications',
      route: '/applications',
      deepLink: buildDeepLink('my_applications'),
      jobTitle,
      interviewDate
    },
    'interview_scheduled'
  );
};

/**
 * Remind about upcoming interview (1 day before)
 */
const notifyInterviewReminder = async (applicantId, jobTitle, interviewDate) => {
  return await sendToUser(
    applicantId,
    '⏰ Interview Reminder',
    `Your interview for ${jobTitle} is tomorrow`,
    {
      screen: 'my_applications',
      route: '/applications',
      deepLink: buildDeepLink('my_applications'),
      jobTitle,
      interviewDate
    },
    'interview_reminder'
  );
};

/**
 * Notify about profile view
 */
const notifyProfileView = async (userId, viewerName) => {
  return await sendToUser(
    userId,
    '👁️ Profile Viewed',
    `${viewerName} viewed your profile`,
    {
      screen: 'profile',
      route: '/profile',
      deepLink: buildDeepLink('profile')
    },
    'profile_view'
  );
};

/**
 * Notify about account activity
 */
const notifyAccountActivity = async (userId, activity, details) => {
  const activityMessages = {
    login: 'New login detected on your account',
    password_changed: 'Your password was changed successfully',
    email_changed: 'Your email was updated successfully',
    profile_updated: 'Your profile has been updated'
  };

  return await sendToUser(
    userId,
    '🔐 Account Activity',
    activityMessages[activity] || details,
    {
      screen: 'settings',
      route: '/settings',
      deepLink: buildDeepLink('settings'),
      activity
    },
    'account_activity'
  );
};

// ============================================================================
// 6. ADMIN/SYSTEM NOTIFICATIONS
// ============================================================================

/**
 * Send system announcement to all users (via topic)
 */
const notifySystemAnnouncement = async (title, message) => {
  return await sendToTopic(
    'all_users',
    title,
    message,
    {
      screen: 'notifications'
    },
    'system_announcement'
  );
};

/**
 * Notify about account verification
 */
const notifyAccountVerified = async (userId) => {
  return await sendToUser(
    userId,
    '✅ Account Verified!',
    'Your account has been successfully verified',
    {
      screen: 'profile',
      route: '/profile',
      deepLink: buildDeepLink('profile')
    },
    'account_verified'
  );
};

// ============================================================================
// 7. REMINDER NOTIFICATIONS
// ============================================================================

/**
 * Remind to complete profile
 */
const notifyCompleteProfile = async (userId) => {
  return await sendToUser(
    userId,
    '📝 Complete Your Profile',
    'Complete your profile to get more job opportunities',
    {
      screen: 'profile',
      route: '/profile',
      deepLink: buildDeepLink('profile')
    },
    'complete_profile'
  );
};

/**
 * Remind about saved jobs
 */
const notifySavedJobsReminder = async (userId, jobCount) => {
  return await sendToUser(
    userId,
    '💼 Saved Jobs Reminder',
    `You have ${jobCount} saved jobs. Apply now!`,
    {
      screen: 'saved_jobs',
      route: '/saved-jobs',
      deepLink: buildDeepLink('saved_jobs')
    },
    'saved_jobs_reminder'
  );
};

// ============================================================================
// 8. UTILITY FUNCTIONS
// ============================================================================

/**
 * Test notification
 */
const sendTestNotification = async (userId, title, body) => {
  return await sendToUser(
    userId,
    title || 'Test Notification 🔔',
    body || 'This is a test notification from JobConnect!',
    {
      type: 'test',
      screen: 'notifications',
      route: '/notifications',
      deepLink: buildDeepLink('notifications')
    },
    'test'
  );
};

/**
 * Subscribe user to topic
 */
const subscribeToTopic = async (userId, topic) => {
  try {
    const user = await User.findById(userId).select('fcmTokens notificationPreferences');

    // ✅ CHECK: Only subscribe if push notifications are enabled
    if (!user.notificationPreferences?.push) {
      logger.info(`Cannot subscribe user ${userId} to ${topic}: push disabled`);
      return { success: false, reason: 'push_disabled' };
    }

    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return { success: false, message: 'User has no registered devices' };
    }

    const tokens = user.fcmTokens.map(t => t.token);
    const response = await admin.messaging().subscribeToTopic(tokens, topic);

    logger.info(`User ${userId} subscribed to topic ${topic}:`, {
      successCount: response.successCount,
      failureCount: response.failureCount
    });

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    logger.error(`Error subscribing to topic ${topic}:`, error);
    return { success: false, message: error.message };
  }
};

/**
 * Unsubscribe user from topic
 */
const unsubscribeFromTopic = async (userId, topic) => {
  try {
    const user = await User.findById(userId).select('fcmTokens');

    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return { success: false, message: 'User has no registered devices' };
    }

    const tokens = user.fcmTokens.map(t => t.token);
    const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);

    logger.info(`User ${userId} unsubscribed from topic ${topic}:`, {
      successCount: response.successCount,
      failureCount: response.failureCount
    });

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    logger.error(`Error unsubscribing from topic ${topic}:`, error);
    return { success: false, message: error.message };
  }
};

/**
 * Send notification to multiple users
 */
const sendNotificationToMultipleUsers = async (userIds, title, body, data = {}) => {
  try {
    const results = await Promise.all(
      userIds.map(userId => sendToUser(userId, title, body, data))
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      success: successCount > 0,
      successCount,
      failureCount,
      totalUsers: userIds.length
    };
  } catch (error) {
    logger.error('Error sending notifications to multiple users:', error);
    return { success: false, message: error.message };
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  sendToUser,
  sendToTopic,
  sendTestNotification,
  
  // Application notifications
  notifyNewApplication,
  notifyApplicationStatus,
  
  // Chat notifications
  notifyNewMessage,
  
  // Job notifications
  notifyNewJobPosted,
  notifyJobStatusChange,
  
  // Interview notifications
  notifyInterviewScheduled,
  notifyInterviewReminder,
  
  // Profile notifications
  notifyProfileView,
  notifyAccountActivity,
  
  // System notifications
  notifySystemAnnouncement,
  notifyAccountVerified,
  
  // Reminder notifications
  notifyCompleteProfile,
  notifySavedJobsReminder,
  
  // Utility functions
  subscribeToTopic,
  unsubscribeFromTopic,
  sendNotificationToMultipleUsers
};