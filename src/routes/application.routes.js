// ==================== APPLICATION ROUTES - COMPLETE ====================
// src/routes/application.routes.js
// Copy and paste this ENTIRE file

const express = require('express');
const router = express.Router();
const { uploadFile } = require('../middleware/upload.middleware');

const {
  applyToJob,
  getMyApplicationsAsJobSeeker,  // ✅ NEW: For job seekers
  getJobApplications,            // ✅ RENAMED: For employers
  getApplicationById,
  updateApplicationStatus,
  withdrawApplication,
  scheduleInterview,
  rejectApplication,
  shortlistApplication,
  getApplicationStats
} = require('../controllers/application.controller');

const {
  authenticate,
  authorize
} = require('../middleware/auth.middleware');

// ============================================
// JOB SEEKER ROUTES
// ============================================

/**
 * Get my own applications as a job seeker
 * GET /api/v1/applications/my-applications?page=1&limit=20&status=pending
 */
router.get(
  '/my-applications', 
  authenticate, 
  authorize('jobseeker'), 
  getMyApplicationsAsJobSeeker  // ✅ Uses correct function
);

/**
 * Apply to a job
 * POST /api/v1/applications/jobs/:jobId/apply
 * Body: multipart/form-data with resume file + other fields
 */
router.post(
  '/jobs/:jobId/apply', 
  authenticate, 
  authorize('jobseeker'), 
  uploadFile.single('resume'),
  applyToJob
);

/**
 * Withdraw my application
 * PUT /api/v1/applications/applications/:id/withdraw
 */
router.put(
  '/applications/:id/withdraw', 
  authenticate, 
  authorize('jobseeker'), 
  withdrawApplication
);

// ============================================
// EMPLOYER ROUTES
// ============================================

/**
 * Get applications for a specific job I posted
 * GET /api/v1/applications/jobs/:jobId/applicants?page=1&limit=20&status=pending
 */
router.get(
  '/jobs/:jobId/applicants',  // ✅ Better route name for employers
  authenticate, 
  authorize('employer'), 
  getJobApplications
);

/**
 * Update application status
 * PUT /api/v1/applications/applications/:id/status
 * Body: { status: 'reviewing', notes: 'Good candidate', rating: 4 }
 */
router.put(
  '/applications/:id/status', 
  authenticate, 
  authorize('employer'), 
  updateApplicationStatus
);

/**
 * Schedule interview for an application
 * POST /api/v1/applications/applications/:id/interview
 * Body: { scheduledAt: '2025-01-15T10:00:00Z', type: 'video', link: '...' }
 */
router.post(
  '/applications/:id/interview', 
  authenticate, 
  authorize('employer'), 
  scheduleInterview
);

/**
 * Reject application
 * PUT /api/v1/applications/applications/:id/reject
 * Body: { reason: 'Not qualified', feedback: 'Thanks for applying' }
 */
router.put(
  '/applications/:id/reject', 
  authenticate, 
  authorize('employer'), 
  rejectApplication
);

/**
 * Shortlist application
 * PUT /api/v1/applications/applications/:id/shortlist
 */
router.put(
  '/applications/:id/shortlist', 
  authenticate, 
  authorize('employer'), 
  shortlistApplication
);

// ============================================
// SHARED ROUTES (Both Job Seekers and Employers)
// ============================================

/**
 * Get application statistics
 * GET /api/v1/applications/applications/stats
 * Returns different stats based on user role
 */
router.get(
  '/applications/stats', 
  authenticate, 
  authorize('jobseeker', 'employer'), 
  getApplicationStats
);

/**
 * Get single application details
 * GET /api/v1/applications/applications/:id
 * Job seeker sees their application, employer sees applicant's details
 */
router.get(
  '/applications/:id', 
  authenticate, 
  authorize('jobseeker', 'employer'), 
  getApplicationById
);

module.exports = router;