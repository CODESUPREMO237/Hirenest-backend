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

    user.isBlocked = !user.isBlocked;
    if (user.isBlocked) {
      user.blockedReason = reason;
      user.blockedAt = new Date();
    } else {
      user.blockedReason = null;
      user.blockedAt = null;
    }

    await user.save();

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

    await User.findByIdAndUpdate(userId, {
      deletedAt: new Date(),
      isActive: false
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

// Export only admin functions
module.exports = {
  getDashboardOverview,
  getAllUsers,
  toggleUserBlock,
  deleteUser,
  moderateJob,
  moderateProduct,
  getReportedContent
};