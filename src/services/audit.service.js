// ============================================================================
// AUDIT SERVICE
// src/services/audit.service.js
// ============================================================================

const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

/**
 * Log an admin action to the audit trail.
 *
 * @param {Object} params
 * @param {string} params.actorId       - The admin user's _id
 * @param {string} params.actorEmail    - The admin user's email
 * @param {string} params.action        - Action enum (e.g. 'user.block')
 * @param {string} params.targetType    - Entity type ('User', 'Job', 'Product', 'Order')
 * @param {string} [params.targetId]    - The affected entity's _id
 * @param {string} params.description   - Human-readable summary
 * @param {Object} [params.metadata]    - Extra data (reason, before/after, etc.)
 * @param {Object} [params.req]         - Express request (for IP/UA extraction)
 */
const logAction = async ({ actorId, actorEmail, action, targetType, targetId, description, metadata = {}, req }) => {
  try {
    const entry = await AuditLog.create({
      actor: actorId,
      actorEmail,
      action,
      targetType,
      targetId,
      description,
      metadata,
      ipAddress: req?.ip || req?.connection?.remoteAddress || 'unknown',
      userAgent: req?.get?.('User-Agent') || 'unknown'
    });

    logger.info(`📝 Audit: [${action}] ${description} (by ${actorEmail})`);
    return entry;
  } catch (error) {
    // Audit logging should never crash the main flow
    logger.error('❌ Audit logging failed (non-fatal):', error.message);
    return null;
  }
};

/**
 * Query audit logs with filters and pagination.
 */
const getLogs = async ({ actorId, action, targetType, startDate, endDate, page = 1, limit = 50 } = {}) => {
  try {
    const query = {};

    if (actorId) query.actor = actorId;
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('actor', 'profile email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(query)
    ]);

    return {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  } catch (error) {
    logger.error('Audit log query error:', error);
    throw error;
  }
};

module.exports = {
  logAction,
  getLogs
};
