// ============================================================================
// GDPR CONTROLLER — Data Export & Account Deletion
// src/controllers/gdpr.controller.js
// ============================================================================

const User = require('../models/User');
const Job = require('../models/Job');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Application = require('../models/Application');
const Chat = require('../models/chat');
const Message = require('../models/Message');
const logger = require('../config/logger');
const auditService = require('../services/audit.service');

/**
 * Export all user data as JSON (GDPR right of access)
 */
const exportMyData = async (req, res) => {
  try {
    const userId = req.user._id;

    const [user, jobs, products, orders, applications, messages] = await Promise.all([
      User.findById(userId).select('-__v -password'),
      Job.find({ postedBy: userId }).select('-__v'),
      Product.find({ seller: userId }).select('-__v'),
      Order.find({ $or: [{ buyer: userId }, { seller: userId }] }).select('-__v'),
      Application.find({ applicant: userId }).select('-__v'),
      Message.find({ sender: userId }).select('-__v')
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: user?.toObject() || null,
      jobs,
      products,
      orders,
      applications,
      messages
    };

    res.status(200).json({
      status: 'success',
      data: exportData
    });
  } catch (error) {
    logger.error('Error exporting user data:', error);
    res.status(500).json({ status: 'error', message: 'Error exporting data' });
  }
};

/**
 * Permanently delete account and anonymize PII (GDPR right to erasure)
 */
const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Anonymize PII instead of hard delete (preserve referential integrity)
    const anonymized = {
      email: `deleted_${userId}@anonymized.local`,
      'profile.firstName': 'Deleted',
      'profile.lastName': 'User',
      'profile.displayName': 'Deleted User',
      'profile.avatar': null,
      'profile.phone': null,
      'profile.bio': null,
      'profile.dateOfBirth': null,
      'profile.gender': null,
      'profile.location': {},
      'jobSeekerProfile.resume': {},
      'jobSeekerProfile.skills': [],
      'jobSeekerProfile.education': [],
      'jobSeekerProfile.experience': [],
      socialLogins: {},
      fcmTokens: [],
      isActive: false,
      deletedAt: new Date()
    };

    await User.findByIdAndUpdate(userId, { $set: anonymized });

    // Deactivate user's active listings
    await Promise.all([
      Job.updateMany({ postedBy: userId }, { status: 'closed' }),
      Product.updateMany({ seller: userId }, { status: 'inactive' })
    ]);

    // Audit log (use email before anonymization)
    await auditService.logAction({
      actorId: userId,
      actorEmail: user.email,
      action: 'other',
      targetType: 'User',
      targetId: userId,
      description: `User ${user.email} permanently deleted their account (GDPR erasure)`,
      req
    });

    res.status(200).json({
      status: 'success',
      message: 'Account permanently deleted. All personal data has been anonymized.'
    });
  } catch (error) {
    logger.error('Error deleting account:', error);
    res.status(500).json({ status: 'error', message: 'Error deleting account' });
  }
};

module.exports = {
  exportMyData,
  deleteMyAccount
};
