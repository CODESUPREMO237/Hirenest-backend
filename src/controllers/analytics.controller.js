// ==================== ANALYTICS CONTROLLER (FIXED) ====================
// src/controllers/analytics.controller.js

const User = require('../models/User');
const Job = require('../models/Job');
const Product = require('../models/Product');
const Application = require('../models/Application');
const logger = require('../config/logger');

/**
 * Get platform statistics
 */
const getPlatformStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // User growth
    const userGrowth = await User.aggregate([
      { $match: { ...dateFilter, deletedAt: null } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Job statistics
    const jobStats = await Job.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Product statistics
    const productStats = await Product.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Application statistics
    const applicationStats = await Application.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Top categories
    const topJobCategories = await Job.aggregate([
      { $match: { status: 'active', deletedAt: null } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const topProductCategories = await Product.aggregate([
      { $match: { status: 'active', deletedAt: null } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        userGrowth,
        jobStats,
        productStats,
        applicationStats,
        topJobCategories,
        topProductCategories
      }
    });
  } catch (error) {
    logger.error('Error fetching platform stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching statistics'
    });
  }
};

/**
 * Get user analytics (for individual users) - FIXED VERSION
 */
// COMPLETE FIX: Analytics Controller - getUserAnalytics function
// Replace the entire getUserAnalytics function in analytics.controller.js

const getUserAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    console.log('📊 [getUserAnalytics] Fetching analytics for user:', userId, 'Role:', userRole);

    let analytics = {};

    if (userRole === 'jobseeker') {
      // ==================== JOB SEEKER ANALYTICS ====================
      console.log('   📝 Calculating job seeker analytics...');
      
      const applicationStats = await Application.aggregate([
        { $match: { applicant: userId, deletedAt: null } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const recentApplications = await Application.find({ 
        applicant: userId,
        deletedAt: null 
      })
        .populate('job')
        .sort({ createdAt: -1 })
        .limit(5);

      const totalApplications = await Application.countDocuments({ 
        applicant: userId,
        deletedAt: null 
      });

      console.log('   ✅ Job seeker stats:', {
        totalApplications,
        statuses: applicationStats
      });

      analytics = {
        applicationStats,
        recentApplications,
        totalApplications
      };

    } else if (userRole === 'employer') {
      // ==================== EMPLOYER ANALYTICS ====================
      console.log('   💼 Calculating employer analytics...');
      
      // 🔧 FIX: Explicitly select the stats field for jobs
      const jobs = await Job.find({ 
        postedBy: userId, 
        deletedAt: null 
      }).select('+stats'); // ✅ Ensures stats is included
      
      const jobIds = jobs.map(job => job._id);
      
      console.log('   📋 Found', jobs.length, 'jobs for employer');

      // Calculate total views from job stats
      const totalViews = jobs.reduce((sum, job) => {
        const views = job.stats?.views || 0;
        console.log(`   📊 Job ${job._id} (${job.title}): ${views} views`);
        return sum + views;
      }, 0);
      
      const totalUniqueViews = jobs.reduce((sum, job) => {
        const uniqueViews = job.stats?.uniqueViews || 0;
        return sum + uniqueViews;
      }, 0);

      console.log('   👁️ Total job views across all jobs:', totalViews);
      console.log('   👤 Total unique job views:', totalUniqueViews);

      // Application statistics by status
      const applicationStats = await Application.aggregate([
        { $match: { job: { $in: jobIds }, deletedAt: null } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Applications by job
      const applicationsByJob = await Application.aggregate([
        { $match: { job: { $in: jobIds }, deletedAt: null } },
        {
          $group: {
            _id: '$job',
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            shortlisted: {
              $sum: { $cond: [{ $eq: ['$status', 'shortlisted'] }, 1, 0] }
            },
            rejected: {
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
            }
          }
        }
      ]);

      // Job statistics by status
      const jobsByStatus = jobs.reduce((acc, job) => {
        const existing = acc.find(s => s._id === job.status);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ _id: job.status, count: 1 });
        }
        return acc;
      }, []);

      const totalApplications = await Application.countDocuments({ 
        job: { $in: jobIds },
        deletedAt: null 
      });

      console.log('   📊 Employer stats calculated:', {
        totalJobs: jobs.length,
        activeJobs: jobs.filter(j => j.status === 'active').length,
        totalApplications,
        totalViews,
        totalUniqueViews
      });

      analytics = {
        totalJobs: jobs.length,
        activeJobs: jobs.filter(j => j.status === 'active').length,
        totalApplications,
        totalViews,  // ✅ Job views
        totalUniqueViews,  // ✅ Unique job views
        applicationStats,
        applicationsByJob,
        jobsByStatus,
        // Include individual job stats for detailed view
        jobsWithStats: jobs.map(job => ({
          id: job._id,
          title: job.title,
          status: job.status,
          views: job.stats?.views || 0,
          uniqueViews: job.stats?.uniqueViews || 0,
          applications: job.stats?.applications || 0,
          createdAt: job.createdAt
        }))
      };
    }

    // ==================== MARKETPLACE ANALYTICS (ALL USERS) ====================
    console.log('   🛒 Calculating marketplace analytics...');
    
    const myProducts = await Product.countDocuments({
      seller: userId,
      deletedAt: null
    });

    const activeProducts = await Product.countDocuments({
      seller: userId,
      status: 'active',
      deletedAt: null
    });

    // 🔧 FIX: Get products with stats field explicitly selected
    const products = await Product.find({ 
      seller: userId, 
      deletedAt: null 
    }).select('+stats'); // ✅ Ensures stats is included for products too
    
    const productViews = products.reduce((sum, product) => {
      const views = product.stats?.views || 0;
      console.log(`   🛍️ Product ${product._id} (${product.name}): ${views} views`);
      return sum + views;
    }, 0);

    const productUniqueViews = products.reduce((sum, product) => {
      return sum + (product.stats?.uniqueViews || 0);
    }, 0);

    console.log('   🛍️ Marketplace stats:', {
      totalProducts: myProducts,
      activeProducts,
      productViews,
      productUniqueViews
    });

    analytics.marketplace = {
      totalProducts: myProducts,
      activeProducts,
      totalViews: productViews,  // ✅ Product views
      totalUniqueViews: productUniqueViews,  // ✅ Unique product views
      sellerRating: req.user.marketplaceStats?.sellerRating || { average: 0, count: 0 },
      // Include individual product stats
      productsWithStats: products.map(product => ({
        id: product._id,
        name: product.name,
        status: product.status,
        views: product.stats?.views || 0,
        uniqueViews: product.stats?.uniqueViews || 0,
        createdAt: product.createdAt
      }))
    };

    console.log('✅ [getUserAnalytics] Analytics calculation complete');
    console.log('📤 [getUserAnalytics] Final analytics summary:', {
      role: userRole,
      totalJobs: analytics.totalJobs,
      totalViews: analytics.totalViews,
      totalUniqueViews: analytics.totalUniqueViews,
      marketplaceProducts: analytics.marketplace?.totalProducts,
      marketplaceViews: analytics.marketplace?.totalViews,
      marketplaceUniqueViews: analytics.marketplace?.totalUniqueViews
    });

    res.status(200).json({
      status: 'success',
      data: { analytics }
    });
  } catch (error) {
    console.error('❌ [getUserAnalytics] Error:', error);
    logger.error('Error fetching user analytics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching analytics'
    });
  }
};

/**
 * Get revenue analytics (admin only)
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // This would integrate with payment service
    // const { calculatePlatformRevenue } = require('../services/payment.service');
    
    const start = new Date(startDate || Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = new Date(endDate || Date.now());

    // TODO: Implement actual revenue calculation when payment service is ready
    // const revenue = await calculatePlatformRevenue(start, end);
    
    const revenue = {
      total: 0,
      period: { start, end },
      message: 'Revenue tracking - implementation pending'
    };

    res.status(200).json({
      status: 'success',
      data: { revenue }
    });
  } catch (error) {
    logger.error('Error fetching revenue analytics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching revenue data'
    });
  }
};
  
module.exports = {
  getPlatformStats,
  getUserAnalytics,
  getRevenueAnalytics
};