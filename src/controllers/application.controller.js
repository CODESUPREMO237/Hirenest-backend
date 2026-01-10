// Application Controller - COMPLETE WITH JOB STATS TRACKING
// controllers/application.controller.js
// Copy and paste this ENTIRE file - COMPLETE VERSION

const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');
const logger = require('../config/logger');

const { 
  sendApplicationReceivedEmail, 
  sendNewApplicationNotification, 
  sendApplicationStatusEmail 
} = require('../services/email.service');

// ✅ IMPORT NOTIFICATION SERVICE
const { 
  notifyNewApplication,
  notifyApplicationStatus 
} = require('../services/notification.service');

/**
 * Apply to a job (Job Seekers only) - WITH PUSH NOTIFICATIONS
 */
const applyToJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user._id;

    // ✅ FIX: Log the incoming request to debug
    console.log('📥 Application Request Body:', req.body);
    console.log('📎 Application Request File:', req.file);

    // Check if job exists and is accepting applications
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    if (!job.isAcceptingApplications()) {
      return res.status(400).json({
        status: 'error',
        message: 'This job is no longer accepting applications'
      });
    }

    // Check if user has already applied
    const hasApplied = await Application.hasApplied(jobId, userId);

    if (hasApplied) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already applied to this job'
      });
    }

    // Get user's CV if not provided
    const user = await User.findById(userId);
    
    // Handle Resume File
    let resumeData;
    
    if (req.file) {
      // If a file was uploaded in this request
      resumeData = {
        url: req.file.path, // Or the URL from Cloudinary/S3
        filename: req.file.originalname,
        publicId: req.file.filename, // Cloudinary public ID
        size: req.file.size
      };
    } else {
      // Fallback to user profile resume
      if (user.jobSeekerProfile?.resume?.url) {
        resumeData = user.jobSeekerProfile.resume;
      }
    }

    if (!resumeData || !resumeData.url) {
      return res.status(400).json({
        status: 'error',
        message: 'Please upload your CV/Resume'
      });
    }

    // ✅ FIX: Extract coverLetter from req.body
    const coverLetter = req.body.coverLetter || '';
    console.log('📝 Cover Letter:', coverLetter);

    // ✅ FIX: Parse screeningAnswers properly
    let screeningAnswers = [];
    if (req.body.screeningAnswers) {
      try {
        screeningAnswers = typeof req.body.screeningAnswers === 'string' 
          ? JSON.parse(req.body.screeningAnswers) 
          : req.body.screeningAnswers;
        console.log('✅ Parsed Screening Answers:', screeningAnswers);
      } catch (e) {
        console.error("❌ Error parsing screeningAnswers:", e);
      }
    }

    // Parse additionalInfo if sent as string
    let additionalInfo = {};
    if (req.body.additionalInfo) {
      try {
        additionalInfo = typeof req.body.additionalInfo === 'string'
          ? JSON.parse(req.body.additionalInfo)
          : req.body.additionalInfo;
      } catch (e) {
        console.error("Error parsing additionalInfo:", e);
        additionalInfo = {}; 
      }
    }

    // ✅ FIX: Create application with properly extracted data
    const application = await Application.create({
      job: jobId,
      applicant: userId,
      coverLetter: coverLetter, // Now properly extracted
      resume: resumeData,
      screeningAnswers: screeningAnswers, // Now properly parsed
      additionalInfo: additionalInfo,
      appliedAt: new Date()
    });

    console.log('✅ Application Created:', {
      id: application._id,
      coverLetter: application.coverLetter,
      screeningAnswers: application.screeningAnswers
    });

    // *** CRITICAL: Increment job's application count ***
    await job.incrementApplications();
    logger.info(`Application count incremented for job ${jobId}`);

    // ✅ Populate BOTH job and applicant with all nested details
    await application.populate([
      {
        path: 'job',
        populate: { path: 'postedBy company' }
      },
      {
        path: 'applicant',
        select: '-password -otp -otpExpires'
      }
    ]);

    // Update user stats
    await User.findByIdAndUpdate(userId, { 
      $inc: { "jobSeekerProfile.stats.appliedJobs": 1 } 
    });
    logger.info(`User appliedJobs count incremented for user ${userId}`);

   // BACKGROUND NOTIFICATIONS (EMAIL + PUSH)
    setImmediate(async () => {
      try {
        const jobTitle = application.job.title;
        const applicantName = user.profile.displayName || user.profile.firstName;
        const employerId = application.job.postedBy._id;
        const employerEmail = application.job.postedBy.email;
        const employerName = application.job.postedBy.profile?.firstName || 'Employer';

        // Send Email to Applicant
        await sendApplicationReceivedEmail(
          user.email,
          applicantName,
          jobTitle,
          application.job.companyName || 'the company'
        );

        // Send Email to Employer
        await sendNewApplicationNotification(
          employerEmail,
          employerName,
          applicantName,
          jobTitle
        );

        // ✅ SEND PUSH NOTIFICATION TO EMPLOYER
        await notifyNewApplication(
          employerId,
          jobTitle,
          applicantName
        );
        
        logger.info(`Application notifications sent for Job: ${jobId}`);
      } catch (err) {
        logger.error('Error in application background notifications:', err);
      }
    }); 

    // ✅ Convert to object AFTER population
    const applicationObj = application.toObject();

    res.status(201).json({
      status: 'success',
      message: 'Application submitted successfully',
      data: { 
        application: applicationObj
      }
    });
  } catch (error) {
    logger.error('Error applying to job:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error submitting application',
      error: error.message
    });
  }
};


/**
 * Get my applications (Job Seeker only)
 * Route: GET /my-applications
 * ✅ FIXED VERSION - Ensures job is ALWAYS populated with employer details
 */
const getMyApplicationsAsJobSeeker = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {
      applicant: userId,
      deletedAt: null
    };

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ✅ FIX: Fetch applications with DEEPLY populated job details
    const applications = await Application.find(query)
      .populate({
        path: 'job',
        populate: [
          { 
            path: 'postedBy',
            select: 'profile email role'
          },
          {
            path: 'company',
            select: 'name logo'
          }
        ]
      })
      .populate({
        path: 'applicant',
        select: '-password -otp -otpExpires'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // ✅ ADD: Convert to plain objects for easier serialization

    const total = await Application.countDocuments(query);

    // ✅ ADD: Filter out applications where job was deleted
    const validApplications = applications.filter(app => app.job != null);

    if (validApplications.length < applications.length) {
      logger.warn(`${applications.length - validApplications.length} applications have deleted jobs`);
    }

    // ✅ ADD: Debug logging
    if (validApplications.length > 0) {
      const firstApp = validApplications[0];
      logger.info('First application check:', {
        id: firstApp._id,
        jobType: typeof firstApp.job,
        jobId: firstApp.job?._id,
        hasPostedBy: !!firstApp.job?.postedBy,
        postedById: firstApp.job?.postedBy?._id,
        hasCompany: !!firstApp.job?.company
      });
    }

    logger.info(`Fetched ${validApplications.length} applications for user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: {
        applications: validApplications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching my applications:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching applications',
      error: error.message
    });
  }
};

/**
 * Get applications for a specific job (Employer only)
 * Route: GET /jobs/:jobId/applicants
 * ✅ RENAMED from getMyApplications - For employers to see applications for their job
 */
const getJobApplications = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    // Verify job exists and user owns it
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    // Check if user is the job poster
    if (job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    // Build query
    const query = {
      job: jobId,
      deletedAt: null
    };

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ✅ FIX: Populate BOTH job and applicant with full details
    const applications = await Application.find(query)
      .populate({
        path: 'job',
        populate: { 
          path: 'postedBy company',
          select: '-password -otp -otpExpires'
        }
      })
      .populate({
        path: 'applicant',
        select: '-password -otp -otpExpires' // Exclude sensitive fields but include everything else
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(query);

    // Log for debugging
    logger.info(`Fetched ${applications.length} applications for job ${jobId}`);
    if (applications.length > 0) {
      logger.debug(`First application applicant type: ${typeof applications[0].applicant}`);
      logger.debug(`First application has profile: ${!!applications[0].applicant?.profile}`);
      logger.debug(`First application has jobSeekerProfile: ${!!applications[0].applicant?.jobSeekerProfile}`);
    }

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
    logger.error('Error fetching job applications:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching applications',
      error: error.message
    });
  }
};

/**
 * Get application by ID
 */
const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const application = await Application.findById(id)
      .populate('job applicant')
      .populate({
        path: 'job',
        populate: { path: 'company postedBy' }
      });

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    // Check authorization
    const isApplicant = application.applicant._id.toString() === userId.toString();
    const isEmployer = application.job.postedBy._id.toString() === userId.toString();

    if (!isApplicant && !isEmployer) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    // Mark as viewed if employer is viewing
    if (isEmployer && !application.isViewed) {
      application.isViewed = true;
      application.viewedAt = new Date();
      await application.save();
    }

    // Filter sensitive data for applicant
    let responseData = application.toObject();
    if (isApplicant && !isEmployer) {
      delete responseData.employerNotes;
      delete responseData.employerRating;
    }

    res.status(200).json({
      status: 'success',
      data: { application: responseData }
    });
  } catch (error) {
    logger.error('Error fetching application:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching application'
    });
  }
};

/**
 * Update application status (Employer only) - WITH PUSH NOTIFICATIONS
 */
const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, rating } = req.body;
    const userId = req.user._id;

    const application = await Application.findById(id)
      .populate('job')
      .populate('applicant');

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    // Check if user is the job poster
    if (application.job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    // Update status
    await application.updateStatus(status);

    // Update notes and rating if provided
    if (notes) {
      application.employerNotes = notes;
    }

    if (rating) {
      application.employerRating = rating;
    }

    await application.save();

   
    // BACKGROUND NOTIFICATION (EMAIL + PUSH)
    setImmediate(async () => {
      try {
        const applicantId = application.applicant._id;
        const applicantEmail = application.applicant.email;
        const applicantName = application.applicant.profile.firstName || 'User';
        const jobTitle = application.job.title;

        // Send Email
        await sendApplicationStatusEmail(
          applicantEmail,
          applicantName,
          jobTitle,
          status
        );

        // ✅ SEND PUSH NOTIFICATION TO APPLICANT
        await notifyApplicationStatus(
          applicantId,
          jobTitle,
          status
        );

        logger.info(`Status update notifications sent for application ${id}`);
      } catch (err) {
        logger.error('Status update notification failed:', err);
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Application status updated',
      data: { application }
    });
  } catch (error) {
    logger.error('Error updating application:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating application'
    });
  }
};

/**
 * Withdraw application (Applicant only)
 */
const withdrawApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    if (application.applicant.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    if (['accepted', 'rejected', 'withdrawn'].includes(application.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot withdraw application with status: ${application.status}`
      });
    }

    // Withdraw the application
    await application.withdraw();

    // *** CRITICAL: Decrement job's application count ***
    const job = await Job.findById(application.job);
    if (job) {
      await job.decrementApplications();
      logger.info(`Application count decremented for job ${application.job}`);
    }

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: { 'jobSeekerProfile.stats.applicationsSubmitted': -1 }
    });

    res.status(200).json({
      status: 'success',
      message: 'Application withdrawn successfully',
      data: { application }
    });
  } catch (error) {
    logger.error('Error withdrawing application:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error withdrawing application'
    });
  }
};

/**
 * Schedule interview (Employer only) - WITH PUSH NOTIFICATIONS
 */
const scheduleInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const interviewData = req.body;
    const userId = req.user._id;

    const application = await Application.findById(id)
      .populate('job')
      .populate('applicant');

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    if (application.job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    await application.addInterview(interviewData);

    // BACKGROUND NOTIFICATION (EMAIL + PUSH)
    setImmediate(async () => {
      try {
        const applicantId = application.applicant._id;
        const applicantEmail = application.applicant.email;
        const applicantName = application.applicant.profile.firstName || 'User';
        const jobTitle = application.job.title;

        // Send Email
        await sendApplicationStatusEmail(
          applicantEmail,
          applicantName,
          jobTitle,
          'interviewing'
        );

        // ✅ SEND PUSH NOTIFICATION
        await notifyApplicationStatus(
          applicantId,
          jobTitle,
          'interviewing'
        );

        logger.info(`Interview notifications sent for application ${id}`);
      } catch (err) {
        logger.error('Interview notification failed:', err);
      }
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Interview scheduled successfully',
      data: { application }
    });
  } catch (error) {
    logger.error('Error scheduling interview:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error scheduling interview'
    });
  }
};

/**
 * Reject application (Employer only) - WITH PUSH NOTIFICATIONS
 */
const rejectApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, feedback } = req.body;
    const userId = req.user._id;

    const application = await Application.findById(id).populate('job');

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    if (application.job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    application.status = 'rejected';
    application.rejectedAt = new Date();
    application.rejectionReason = reason;
    application.rejectionFeedback = feedback;

    await application.save();

     // BACKGROUND NOTIFICATION (PUSH)
    setImmediate(async () => {
      try {
        // ✅ SEND PUSH NOTIFICATION
        await notifyApplicationStatus(
          application.applicant._id,
          application.job.title,
          'rejected'
        );

        logger.info(`Rejection notification sent for application ${id}`);
      } catch (err) {
        logger.error('Rejection notification failed:', err);
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Application rejected',
      data: { application }
    });
  } catch (error) {
    logger.error('Error rejecting application:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error rejecting application'
    });
  }
};

/**
 * Shortlist application (Employer only) - WITH PUSH NOTIFICATIONS
 */
const shortlistApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const application = await Application.findById(id).populate('job');

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    if (application.job.postedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    await application.updateStatus('shortlisted');

    // BACKGROUND NOTIFICATION (PUSH)
    setImmediate(async () => {
      try {
        // ✅ SEND PUSH NOTIFICATION
        await notifyApplicationStatus(
          application.applicant._id,
          application.job.title,
          'shortlisted'
        );

        logger.info(`Shortlist notification sent for application ${id}`);
      } catch (err) {
        logger.error('Shortlist notification failed:', err);
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Application shortlisted',
      data: { application }
    });
  } catch (error) {
    logger.error('Error shortlisting application:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error shortlisting application'
    });
  }
};

/**
 * Get application statistics
 */
const getApplicationStats = async (req, res) => {
  try {
    const userId = req.user._id;

    if (req.user.role === 'jobseeker') {
      // Stats for job seeker
      const stats = await Application.aggregate([
        { $match: { applicant: userId, deletedAt: null } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const result = {
        total: 0,
        pending: 0,
        reviewing: 0,
        shortlisted: 0,
        interviewing: 0,
        offered: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0
      };

      stats.forEach(stat => {
        result[stat._id] = stat.count;
        result.total += stat.count;
      });

      res.status(200).json({
        status: 'success',
        data: { stats: result }
      });

    } else if (req.user.role === 'employer') {
      // Stats for employer - across all their jobs
      const jobs = await Job.find({ postedBy: userId }).select('_id');
      const jobIds = jobs.map(job => job._id);

      const stats = await Application.aggregate([
        { $match: { job: { $in: jobIds }, deletedAt: null } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const result = {
        total: 0,
        pending: 0,
        reviewing: 0,
        shortlisted: 0,
        interviewing: 0,
        offered: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0
      };

      stats.forEach(stat => {
        result[stat._id] = stat.count;
        result.total += stat.count;
      });

      res.status(200).json({
        status: 'success',
        data: { stats: result }
      });
    }
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching statistics'
    });
  }
};


/**
 * Get all applications for jobs posted by the employer (OPTIMIZED)
 * @route GET /api/v1/applications/employer-applications
 * @access Private (Employer only)
 */
const getEmployerApplications = async (req, res, next) => {
  try {
    const { page = 1, limit = 100, status } = req.query;
    const employerId = req.user._id;

    console.log('📋 [getEmployerApplications] Starting...');
    console.log(`   Employer: ${employerId}`);
    console.log(`   Page: ${page}, Limit: ${limit}, Status: ${status || 'all'}`);

    // Step 1: Find all job IDs posted by this employer
    const jobs = await Job.find({ postedBy: employerId })
      .select('_id')
      .lean();

    const jobIds = jobs.map(job => job._id);

    console.log(`   Found ${jobIds.length} jobs posted by employer`);

    if (jobIds.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          applications: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0,
          },
        },
      });
    }

    // Step 2: Build query
    const query = { job: { $in: jobIds } };
    if (status) {
      query.status = status;
    }

    // Step 3: Count total
    const total = await Application.countDocuments(query);

    // Step 4: Get applications with full population
    const applications = await Application.find(query)
      .populate({
        path: 'job',
        select: 'title company location employmentType salary postedBy',
      })
      .populate({
        path: 'applicant',
        select: 'email profile jobSeekerProfile',
        populate: {
          path: 'profile',
          select: 'firstName lastName displayName avatar phone location',
        },
      })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ [getEmployerApplications] Returning ${applications.length} applications`);

    res.status(200).json({
      status: 'success',
      data: {
        applications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('❌ [getEmployerApplications] Error:', error);
    next(error);
  }
};

/**
 * Get application statistics for employer (OPTIMIZED)
 * @route GET /api/v1/applications/employer-stats
 * @access Private (Employer only)
 */
const getEmployerApplicationStats = async (req, res, next) => {
  try {
    const employerId = req.user._id;

    console.log('📊 [getEmployerApplicationStats] Starting...');
    console.log(`   Employer: ${employerId}`);

    // Step 1: Find all job IDs
    const jobs = await Job.find({ postedBy: employerId })
      .select('_id')
      .lean();

    const jobIds = jobs.map(job => job._id);

    console.log(`   Found ${jobIds.length} jobs`);

    if (jobIds.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          stats: {
            total: 0,
            pending: 0,
            reviewing: 0,
            interviewing: 0,
            shortlisted: 0,
            rejected: 0,
            accepted: 0,
          },
        },
      });
    }

    // Step 2: Aggregate statistics
    const stats = await Application.aggregate([
      { $match: { job: { $in: jobIds } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Step 3: Format stats
    const formattedStats = {
      total: 0,
      pending: 0,
      reviewing: 0,
      interviewing: 0,
      shortlisted: 0,
      rejected: 0,
      accepted: 0,
    };

    stats.forEach(stat => {
      const status = stat._id.toLowerCase();
      if (formattedStats.hasOwnProperty(status)) {
        formattedStats[status] = stat.count;
      }
      formattedStats.total += stat.count;
    });

    console.log('✅ [getEmployerApplicationStats] Stats:', formattedStats);

    res.status(200).json({
      status: 'success',
      data: { stats: formattedStats },
    });
  } catch (error) {
    console.error('❌ [getEmployerApplicationStats] Error:', error);
    next(error);
  }
};

// ✅ COMPLETE EXPORTS - All functions included
module.exports = {
  applyToJob,
  getMyApplicationsAsJobSeeker,  // ✅ NEW: For job seekers to get their applications
  getJobApplications,            // ✅ RENAMED: For employers to get job applications
  getApplicationById,
  updateApplicationStatus,
  withdrawApplication,
  scheduleInterview,
  rejectApplication,
  shortlistApplication,
  getApplicationStats,
  getEmployerApplications,
  getEmployerApplicationStats
};