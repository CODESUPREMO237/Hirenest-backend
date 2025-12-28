// ==================== JOB ROUTES (FIXED) ====================
// src/routes/job.routes.js

const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/job.controller');

const {
  authenticate,
  authorize,
  optionalAuthenticate,
  checkGuestLimit
} = require('../middleware/auth.middleware');

const { validate, createJobSchema } = require('../middleware/validation.middleware');

// IMPORTANT: Specific routes MUST come BEFORE parameterized routes!
// Public routes - SPECIFIC PATHS FIRST
router.get('/featured', optionalAuthenticate, getFeaturedJobs);
router.get('/categories', getCategories);
router.get('/', optionalAuthenticate, checkGuestLimit('jobsViewed'), getAllJobs);

// Employer routes - SPECIFIC PATHS FIRST
router.post('/', authenticate, authorize('employer'), validate(createJobSchema), createJob);
router.get('/my-jobs', authenticate, authorize('employer'), getMyJobs);

// Routes with :id parameter - THESE MUST COME LAST!
router.get('/:id/similar', optionalAuthenticate, getSimilarJobs);
router.get('/:id/applicants', authenticate, authorize('employer'), getJobApplicants);
router.get('/:id', optionalAuthenticate, checkGuestLimit('jobsViewed'), getJobById);
router.put('/:id', authenticate, authorize('employer'), updateJob);
router.delete('/:id', authenticate, authorize('employer'), deleteJob);
router.put('/:id/status', authenticate, authorize('employer'), changeJobStatus);

module.exports = router;



