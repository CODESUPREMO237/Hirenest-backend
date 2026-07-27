// ==================== ADMIN CONTROLLER ====================
// src/controllers/admin.controller.js

const User = require('../models/User');
const Job = require('../models/Job');
const Product = require('../models/Product');
const Application = require('../models/Application');
const Company = require('../models/Company');
const logger = require('../config/logger');
const Chat = require('../models/chat');       
const Message = require('../models/Message');
const Order = require('../models/Order');
const DeliveryEvent = require('../models/DeliveryEvent');
const escrowService = require('../services/escrow.service');
const auditService = require('../services/audit.service');

/**
 * Get dashboard overview
 */
const getDashboardOverview = async (req, res) => {
  try {
    const [
      totalUsers,
      totalJobs,
      totalProducts,
      totalApplications,
      activeUsers,
      activeJobs,
      activeProducts
    ] = await Promise.all([
      User.countDocuments({ deletedAt: null }),
      Job.countDocuments({ deletedAt: null }),
      Product.countDocuments({ deletedAt: null }),
      Application.countDocuments(),
      User.countDocuments({ isActive: true, deletedAt: null }),
      Job.countDocuments({ status: 'active', deletedAt: null }),
      Product.countDocuments({ status: 'active', deletedAt: null })
    ]);

    // User breakdown by role
    const usersByRole = await User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Recent activity
    const recentUsers = await User.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('profile email role createdAt');

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalUsers,
          totalJobs,
          totalProducts,
          totalApplications,
          activeUsers,
          activeJobs,
          activeProducts
        },
        usersByRole,
        recentUsers
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard overview:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching dashboard data'
    });
  }
};

/**
 * Get all users (admin view)
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      role,
      status,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { deletedAt: null };

    if (role) query.role = role;
    if (status === 'active') query.isActive = true;
    if (status === 'blocked') query.isBlocked = true;
    if (search) {
      query.$or = [
        { email: new RegExp(search, 'i') },
        { 'profile.firstName': new RegExp(search, 'i') },
        { 'profile.lastName': new RegExp(search, 'i') }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    const total = await User.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching users'
    });
  }
};

/**
 * Block/Unblock user
 */
const toggleUserBlock = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const wasBlocked = user.isBlocked;
    user.isBlocked = !user.isBlocked;
    if (user.isBlocked) {
      user.blockedReason = reason;
      user.blockedAt = new Date();
    } else {
      user.blockedReason = null;
      user.blockedAt = null;
    }

    await user.save();

    // Audit log
    await auditService.logAction({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: user.isBlocked ? 'user.block' : 'user.unblock',
      targetType: 'User',
      targetId: user._id,
      description: `${user.isBlocked ? 'Blocked' : 'Unblocked'} user ${user.email}`,
      metadata: { reason: reason || null, previousState: wasBlocked },
      req
    });

    res.status(200).json({
      status: 'success',
      message: user.isBlocked ? 'User blocked' : 'User unblocked',
      data: { user }
    });
  } catch (error) {
    logger.error('Error toggling user block:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating user status'
    });
  }
};

/**
 * Delete user permanently
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await User.findByIdAndUpdate(userId, {
      deletedAt: new Date(),
      isActive: false
    });

    // Audit log
    await auditService.logAction({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'user.delete',
      targetType: 'User',
      targetId: user._id,
      description: `Deleted user ${user.email} (${user.profile?.firstName} ${user.profile?.lastName})`,
      metadata: { email: user.email, role: user.role },
      req
    });

    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting user'
    });
  }
};

/**
 * Moderate jobs
 */
const moderateJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { action, reason } = req.body; // approve, reject, flag

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    if (action === 'approve') {
      job.status = 'active';
    } else if (action === 'reject') {
      job.status = 'closed';
      job.moderationReason = reason;
    }

    await job.save();

    // Audit log
    await auditService.logAction({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: action === 'approve' ? 'job.approve' : 'job.reject',
      targetType: 'Job',
      targetId: job._id,
      description: `${action === 'approve' ? 'Approved' : 'Rejected'} job "${job.title}"`,
      metadata: { reason: reason || null, jobTitle: job.title },
      req
    });

    res.status(200).json({
      status: 'success',
      message: `Job ${action}ed successfully`,
      data: { job }
    });
  } catch (error) {
    logger.error('Error moderating job:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error moderating job'
    });
  }
};

/**
 * Moderate products
 */
const moderateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { action, reason } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    product.moderationStatus = action;
    if (action === 'rejected' || action === 'flagged') {
      product.status = 'inactive';
    }

    await product.save();

    // Audit log
    await auditService.logAction({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: 'product.moderate',
      targetType: 'Product',
      targetId: product._id,
      description: `Moderated product "${product.name}" — ${action}`,
      metadata: { reason: reason || null, productName: product.name, moderationAction: action },
      req
    });

    res.status(200).json({
      status: 'success',
      message: `Product ${action} successfully`,
      data: { product }
    });
  } catch (error) {
    logger.error('Error moderating product:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error moderating product'
    });
  }
};

/**
 * Get reported content
 */
const getReportedContent = async (req, res) => {
  try {
    const reportedProducts = await Product.find({
      isReported: true,
      deletedAt: null
    })
      .populate('seller', 'profile email')
      .limit(20);

    res.status(200).json({
      status: 'success',
      data: {
        reportedProducts
      }
    });
  } catch (error) {
    logger.error('Error fetching reported content:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching reported content'
    });
  }
};

/**
 * Get all disputed orders (with dispute reason from DeliveryEvent)
 */
const getDisputedOrders = async (req, res) => {
  try {
    const disputedOrders = await Order.find({ status: 'DISPUTED' })
      .populate('buyer', 'profile email')
      .populate('seller', 'profile email')
      .populate('product', 'name images price')
      .sort({ updatedAt: -1 });

    // Fetch the DeliveryEvent that caused the dispute for each order
    const orderIds = disputedOrders.map(o => o._id);
    const disputeEvents = await DeliveryEvent.find({
      order: { $in: orderIds },
      eventType: { $in: ['buyer_rejected_item', 'dispute_opened'] }
    }).sort({ createdAt: -1 });

    // Build a map: orderId -> most recent dispute event
    const eventsByOrder = {};
    for (const event of disputeEvents) {
      const key = event.order.toString();
      if (!eventsByOrder[key]) {
        eventsByOrder[key] = event;
      }
    }

    // Attach disputeReason to each order
    const ordersWithReason = disputedOrders.map(order => {
      const orderObj = order.toObject();
      const event = eventsByOrder[order._id.toString()];
      orderObj.disputeReason = event?.metadata?.reason || event?.metadata?.declineReason || 'No reason provided';
      orderObj.disputeEventType = event?.eventType || null;
      orderObj.disputeDate = event?.createdAt || order.updatedAt;
      return orderObj;
    });

    res.status(200).json({
      status: 'success',
      data: { disputedOrders: ordersWithReason }
    });
  } catch (error) {
    logger.error('Error fetching disputed orders:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching disputed orders' });
  }
};

/**
 * Resolve a dispute
 */
const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, reason } = req.body; // 'buyer' or 'seller'
    const adminId = req.user._id.toString();

    if (!['buyer', 'seller'].includes(resolution)) {
      return res.status(400).json({ status: 'error', message: "Resolution must be 'buyer' or 'seller'." });
    }

    const order = await Order.findById(id);
    if (!order || order.status !== 'DISPUTED') {
      return res.status(404).json({ status: 'error', message: 'Disputed order not found.' });
    }

    let resultOrder;
    if (resolution === 'buyer') {
      // Refund buyer
      resultOrder = await escrowService.refundBuyer(id, `admin:${adminId}`, reason);
    } else {
      // Release funds to seller — uses dedicated method, no status flip needed
      resultOrder = await escrowService.resolveDisputeToSeller(id, `admin:${adminId}`, reason);
    }

    // Audit log
    await auditService.logAction({
      actorId: req.user._id,
      actorEmail: req.user.email,
      action: resolution === 'buyer' ? 'dispute.resolve_buyer' : 'dispute.resolve_seller',
      targetType: 'Order',
      targetId: order._id,
      description: `Resolved dispute on order ${order.orderNumber} in favor of ${resolution}`,
      metadata: { resolution, reason, orderNumber: order.orderNumber, amount: order.pricing?.productPrice },
      req
    });

    res.status(200).json({
      status: 'success',
      message: `Dispute resolved in favor of ${resolution}.`,
      data: { order: resultOrder }
    });
  } catch (error) {
    logger.error('Error resolving dispute:', error);
    res.status(500).json({ status: 'error', message: 'Error resolving dispute.' });
  }
};

/**
 * Get audit logs (admin only)
 */
const getAuditLogs = async (req, res) => {
  try {
    const { action, targetType, startDate, endDate, page = 1, limit = 50 } = req.query;

    const result = await auditService.getLogs({
      action,
      targetType,
      startDate,
      endDate,
      page,
      limit
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching audit logs' });
  }
};

// Export admin functions
module.exports = {
  getDashboardOverview,
  getAllUsers,
  toggleUserBlock,
  deleteUser,
  moderateJob,
  moderateProduct,
  getReportedContent,
  getDisputedOrders,
  resolveDispute,
  getAuditLogs
};