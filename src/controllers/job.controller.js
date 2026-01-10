// Job Controller - COMPLETE WITH VIEW TRACKING & APPLICATION COUNTS & PUSH NOTIFICATIONS
// controllers/job.controller.js
// Copy and paste this entire file

const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const Company = require('../models/Company');
const logger = require('../config/logger');

// ✅ IMPORT NOTIFICATION SERVICE
const { 
  notifyNewJobPosted, 
  notifyApplicationStatus 
} = require('../services/notification.service');

/**
 * Create new job posting (Employers only) - WITH PUSH NOTIFICATIONS
 */
const createJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const jobData = req.body;

    // Get employer's company
    const employer = await User.findById(userId).populate('employerProfile.company');

    if (!employer.employerProfile || !employer.employerProfile.company) {
      return res.status(400).json({
        status: 'error',
        message: 'Please set up your company profile before posting jobs'
      });
    }

    // Create job
    const job = await Job.create({
      ...jobData,
      company: employer.employerProfile.company._id,
      postedBy: userId,
      publishedAt: new Date()
    });

    // Update employer stats
    await User.findByIdAndUpdate(userId, {
      $inc: {
        'employerProfile.stats.jobsPosted': 1,
        'employerProfile.stats.activeJobs': 1
      }
    });

    // Populate references
    await job.populate('company postedBy');

    // BACKGROUND NOTIFICATION (PUSH TO TOPIC)
    if (job.status === 'active') {
      setImmediate(async () => {
        try {
          // ✅ SEND PUSH NOTIFICATION TO JOB SEEKERS
          await notifyNewJobPosted(
            job.title,
            employer.employerProfile.company.name,
            job.category,
            job._id.toString()
          );

          logger.info(`New job notification sent for job ${job._id}`);
        } catch (err) {
          logger.error('New job notification failed:', err);
        }
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Job posted successfully',
      data: { job }
    });
  } catch (error) {
    logger.error('Error creating job:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error creating job',
      error: error.message
    });
  }
};

/**
 * Get all jobs with filters
 */
const getAllJobs = async (req, res) => {
  try {
    const {
      search,
      category,
      jobType,
      experienceLevel,
      location,
      minSalary,
      remote,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filters
    const filters = {
      search,
      category,
      jobType,
      experienceLevel,
      location,
      minSalary: minSalary ? parseFloat(minSalary) : undefined,
      remote: remote === 'true'
    };

    // Get jobs
    let query = Job.searchJobs(filters);

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    query = query.sort(sortOptions);

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const jobs = await query
      .populate('company', 'name logo')
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Job.countDocuments(
      Job.searchJobs(filters).getQuery()
    );

    // Track guest views if applicable
    if (req.user && req.user.role === 'guest') {
      setImmediate(async () => {
        try {
          await req.user.incrementGuestAction('jobsViewed');
        } catch (error) {
          logger.error('Error tracking guest view:', error);
        }
      });
    }

    // Get user's applications (single query instead of N queries)
    let appliedJobIds = [];
    if (req.user) {
      const userApplications = await Application.find({ 
        applicant: req.user._id,
        job: { $in: jobs.map(j => j._id) },
        deletedAt: null
      }).select('job');
      
      appliedJobIds = userApplications.map(a => a.job.toString());
    }

    // Get application counts for all jobs (single aggregation query)
    const applicationCounts = await Application.aggregate([
      {
        $match: {
          job: { $in: jobs.map(j => j._id) },
          deletedAt: null
        }
      },
      {
        $group: {
          _id: '$job',
          count: { $sum: 1 }
        }
      }
    ]);

    // Create a map for quick lookup
    const appCountMap = {};
    applicationCounts.forEach(item => {
      appCountMap[item._id.toString()] = item.count;
    });

    // Map jobs with all details
    const jobsWithDetails = jobs.map(job => {
      const jobObj = job.toObject();
      const jobId = jobObj._id.toString();

      return {
        ...jobObj,
        stats: {
          ...jobObj.stats,
          applications: appCountMap[jobId] || 0
        },
        isApplied: appliedJobIds.includes(jobId)
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        jobs: jobsWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching jobs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching jobs'
    });
  }
};

/**
 * Get single job by ID with proper view tracking
 */
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📥 [getJobById] Request received for job:', id);
    console.log('👤 [getJobById] User authenticated:', !!req.user);
    if (req.user) {
      console.log('   User ID:', req.user._id);
      console.log('   User Role:', req.user.role);
    }

    const job = await Job.findOne({
      _id: id,
      deletedAt: null
    }).populate('company postedBy');

    if (!job) {
      console.log('❌ [getJobById] Job not found');
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    console.log('✅ [getJobById] Job found:', job.title);
    console.log('📊 [getJobById] Current stats:', {
      views: job.stats?.views || 0,
      uniqueViews: job.stats?.uniqueViews || 0,
      applications: job.stats?.applications || 0
    });

    // Convert to object to add custom fields
    const jobObj = job.toObject();

    // Track view (SYNCHRONOUSLY for debugging)
    if (req.user) {
      console.log('🔍 [getJobById] Attempting to track view...');
      console.log('   Job has incrementViews method:', typeof job.incrementViews);
      
      try {
        await job.incrementViews(req.user._id);
        console.log('✅ [getJobById] View tracked successfully');
        
        // Reload the job to get updated stats
        const updatedJob = await Job.findById(id);
        console.log('📊 [getJobById] Updated stats:', {
          views: updatedJob.stats?.views || 0,
          uniqueViews: updatedJob.stats?.uniqueViews || 0,
          applications: updatedJob.stats?.applications || 0
        });
        
        // Update the response object with new stats
        jobObj.stats = updatedJob.stats;
      } catch (viewError) {
        console.error('❌ [getJobById] Error tracking view:', viewError);
        console.error('   Error message:', viewError.message);
        console.error('   Error stack:', viewError.stack);
      }

      // Check if current user has applied
      const application = await Application.findOne({
        job: id,
        applicant: req.user._id,
        deletedAt: null
      });
      jobObj.isApplied = !!application;
      console.log('📝 [getJobById] User has applied:', jobObj.isApplied);
      
      // Track guest views
      if (req.user.role === 'guest') {
        console.log('👻 [getJobById] Tracking guest view...');
        try {
          await req.user.incrementGuestAction('jobsViewed');
          console.log('✅ [getJobById] Guest view tracked');
        } catch (guestError) {
          console.error('❌ [getJobById] Error tracking guest view:', guestError);
        }
      }
    } else {
      console.log('⚠️ [getJobById] No user authenticated - view not tracked');
    }

    console.log('📤 [getJobById] Sending response with stats:', jobObj.stats);
    res.status(200).json({
      status: 'success',
      data: { job: jobObj }
    });
  } catch (error) {
    console.error('❌ [getJobById] Controller error:', error);
    logger.error('Error fetching job:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching job'
    });
  }
};

/**
 * Update job (Owner only)
 */
const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user._id;

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Check ownership
    if (job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only update your own job postings'
      });
    }

    // Update job
    Object.keys(updates).forEach(key => {
      job[key] = updates[key];
    });

    await job.save();
    await job.populate('company postedBy');

    res.status(200).json({
      status: 'success',
      message: 'Job updated successfully',
      data: { job }
    });
  } catch (error) {
    logger.error('Error updating job:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating job',
      error: error.message
    });
  }
};

/**
 * Delete job (Owner only)
 */
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    if (job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only delete your own job postings'
      });
    }

    // Soft delete
    job.deletedAt = new Date();
    job.status = 'closed';
    job.closedAt = new Date();
    await job.save();

    // Update employer stats
    await User.findByIdAndUpdate(userId, {
      $inc: {
        'employerProfile.stats.activeJobs': -1
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Job deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting job:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting job'
    });
  }
};

/**
 * Get my posted jobs with accurate application counts
 */
const getMyJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    const query = {
      postedBy: userId,
      deletedAt: null
    };

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(query)
      .populate('company')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get accurate application counts for each job
    const jobsWithCounts = await Promise.all(
      jobs.map(async (job) => {
        const jobObj = job.toObject();
        
        // Get actual application count from Application collection
        const applicationCount = await Application.countDocuments({
          job: job._id,
          deletedAt: null
        });
        
        // Update the stats to reflect actual count
        jobObj.stats.applications = applicationCount;
        jobObj.applicantsCount = applicationCount; // For frontend compatibility
        
        return jobObj;
      })
    );

    const total = await Job.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        jobs: jobsWithCounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching my jobs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching jobs'
    });
  }
};

/**
 * Change job status (pause, activate, close) - WITH PUSH NOTIFICATIONS
 */
const changeJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    const validStatuses = ['draft', 'active', 'paused', 'closed', 'filled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status'
      });
    }

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    if (job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized'
      });
    }

    const oldStatus = job.status;
    job.status = status;

    if (status === 'closed' || status === 'filled') {
      job.closedAt = new Date();

      // ✅ NOTIFY APPLICANTS ABOUT JOB CLOSURE/FILLED
      setImmediate(async () => {
        try {
          const applications = await Application.find({
            job: id,
            status: { $in: ['pending', 'reviewing', 'shortlisted'] },
            deletedAt: null
          }).populate('applicant');

          for (const application of applications) {
            // ✅ SEND PUSH NOTIFICATION TO EACH APPLICANT
            await notifyApplicationStatus(
              application.applicant._id,
              job.title,
              status === 'filled' ? 'position_filled' : 'position_closed'
            );
          }

          logger.info(`Job closure notifications sent for job ${id}`);
        } catch (err) {
          logger.error('Job closure notification failed:', err);
        }
      });
    }

    await job.save();

    // Update stats if status changed
    if (oldStatus === 'active' && status !== 'active') {
      await User.findByIdAndUpdate(userId, {
        $inc: { 'employerProfile.stats.activeJobs': -1 }
      });
    } else if (oldStatus !== 'active' && status === 'active') {
      await User.findByIdAndUpdate(userId, {
        $inc: { 'employerProfile.stats.activeJobs': 1 }
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Job ${status} successfully`,
      data: { job }
    });
  } catch (error) {
    logger.error('Error changing job status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating job status'
    });
  }
};

/**
 * Get job applicants (Employer only)
 */
const getJobApplicants = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    if (job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only view applicants for your own jobs'
      });
    }

    const query = { 
      job: id,
      deletedAt: null
    };
    
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const applications = await Application.find(query)
      .populate('applicant', 'profile email jobSeekerProfile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        applications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching applicants:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching applicants'
    });
  }
};

/**
 * Get job categories
 */
const getCategories = async (req, res) => {
  try {
    const categories = await Job.distinct('category', {
      status: 'active',
      deletedAt: null
    });

    res.status(200).json({
      status: 'success',
      data: { categories }
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching categories'
    });
  }
};

/**
 * Get featured jobs
 */
const getFeaturedJobs = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const jobs = await Job.find({
      status: 'active',
      deletedAt: null
    })
      .populate('company postedBy')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: { jobs }
    });
  } catch (error) {
    logger.error('Error fetching featured jobs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching jobs'
    });
  }
};

/**
 * Get similar jobs
 */
const getSimilarJobs = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 5 } = req.query;

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Find similar jobs based on category and job type
    const similarJobs = await Job.find({
      _id: { $ne: id },
      category: job.category,
      jobType: job.jobType,
      status: 'active',
      deletedAt: null
    })
      .populate('company postedBy')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: { jobs: similarJobs }
    });
  } catch (error) {
    logger.error('Error fetching similar jobs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching jobs'
    });
  }
};

module.exports = {
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getMyJobs,
  changeJobStatus,
  getJobApplicants,
  getCategories,
  getFeaturedJobs,
  getSimilarJobs
};