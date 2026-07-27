// ============================================================================
// AUDIT LOG MODEL
// src/models/AuditLog.js
// ============================================================================

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Who performed the action
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorEmail: {
    type: String,
    required: true
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    enum: [
      'user.block',
      'user.unblock',
      'user.delete',
      'job.approve',
      'job.reject',
      'product.moderate',
      'dispute.resolve_buyer',
      'dispute.resolve_seller',
      'admin.login',
      'admin.logout',
      'other'
    ]
  },

  // What entity was affected
  targetType: {
    type: String,
    enum: ['User', 'Job', 'Product', 'Order', 'Other'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },

  // Human-readable description
  description: {
    type: String,
    required: true
  },

  // Extra metadata (reason, before/after snapshots, etc.)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Request context
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Index for querying by actor, action, and date
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
