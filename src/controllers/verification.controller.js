// ============================================================================
// VERIFICATION CONTROLLER
// src/controllers/verification.controller.js
// ============================================================================

const Verification = require('../models/Verification');
const User = require('../models/User');
const logger = require('../config/logger');
const auditService = require('../services/audit.service');

/**
 * Submit a verification request
 */
const submitVerification = async (req, res) => {
  try {
    const { type, label, documents, userNote } = req.body;

    // Check for existing pending request of the same type
    const existing = await Verification.findOne({
      user: req.user._id,
      type,
      status: 'pending'
    });

    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: `You already have a pending ${type} verification request.`
      });
    }

    const verification = await Verification.create({
      user: req.user._id,
      type,
      label,
      documents,
      userNote
    });

    res.status(201).json({
      status: 'success',
      message: 'Verification submitted for review.',
      data: { verification }
    });
  } catch (error) {
    logger.error('Error submitting verification:', error);
    res.status(500).json({ status: 'error', message: 'Error submitting verification' });
  }
};

/**
 * Get my verification requests
 */
const getMyVerifications = async (req, res) => {
  try {
    const verifications = await Verification.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: { verifications }
    });
  } catch (error) {
    logger.error('Error fetching verifications:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching verifications' });
  }
};

/**
 * Admin: Get all pending verification requests
 */
const getPendingVerifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const query = { status: 'pending' };
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [verifications, total] = await Promise.all([
      Verification.find(query)
        .populate('user', 'profile email')
        .sort({ createdAt: 1 }) // oldest first
        .skip(skip)
        .limit(parseInt(limit)),
      Verification.countDocuments(query)
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        verifications,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (error) {
    logger.error('Error fetching pending verifications:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching verifications' });
  }
};

/**
 * Admin: Review a verification (approve/reject)
 */
const reviewVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reviewNote } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ status: 'error', message: "Action must be 'approved' or 'rejected'." });
    }

    const verification = await Verification.findById(id);
    if (!verification || verification.status !== 'pending') {
      return res.status(404).json({ status: 'error', message: 'Pending verification not found.' });
    }

    verification.status = action;
    verification.reviewedBy = req.user._id;
    verification.reviewedAt = new Date();
    verification.reviewNote = reviewNote || '';
    await verification.save();

    // If approved, update user's verification badges
    if (action === 'approved') {
      await User.findByIdAndUpdate(verification.user, {
        $set: { isVerified: true },
        $addToSet: {
          verificationBadges: {
            type: verification.type,
            label: verification.label,
            verifiedAt: new Date()
          }
        }
      });
    }

    // Audit log
    await auditService.logAction({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'other',
      targetType: 'User',
      targetId: verification.user,
      description: `${action === 'approved' ? 'Approved' : 'Rejected'} ${verification.type} verification for user ${verification.user}`,
      metadata: { verificationType: verification.type, label: verification.label, reviewNote },
      req
    });

    res.status(200).json({
      status: 'success',
      message: `Verification ${action}.`,
      data: { verification }
    });
  } catch (error) {
    logger.error('Error reviewing verification:', error);
    res.status(500).json({ status: 'error', message: 'Error reviewing verification' });
  }
};

module.exports = {
  submitVerification,
  getMyVerifications,
  getPendingVerifications,
  reviewVerification
};
