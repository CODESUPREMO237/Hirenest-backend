// ============================================================================
// MATCHING ROUTES
// src/routes/matching.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const { getRecommendedJobs, getRecommendedCandidates } = require('../controllers/matching.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/jobs', getRecommendedJobs);
router.get('/candidates/:jobId', getRecommendedCandidates);

module.exports = router;
