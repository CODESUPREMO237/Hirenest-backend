// ============================================================================
// MATCHING CONTROLLER
// src/controllers/matching.controller.js
// ============================================================================

const matchingService = require('../services/matching.service');
const logger = require('../config/logger');

/**
 * Get recommended jobs for the authenticated jobseeker
 */
const getRecommendedJobs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const results = await matchingService.getRecommendedJobs(req.user._id, limit);

    res.status(200).json({
      status: 'success',
      data: { recommendations: results }
    });
  } catch (error) {
    logger.error('Error getting recommended jobs:', error);
    res.status(500).json({ status: 'error', message: 'Error getting recommendations' });
  }
};

/**
 * Get recommended candidates for a specific job (employer)
 */
const getRecommendedCandidates = async (req, res) => {
  try {
    const { jobId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const results = await matchingService.getRecommendedCandidates(jobId, limit);

    res.status(200).json({
      status: 'success',
      data: { candidates: results }
    });
  } catch (error) {
    logger.error('Error getting recommended candidates:', error);
    res.status(500).json({ status: 'error', message: 'Error getting candidates' });
  }
};

module.exports = {
  getRecommendedJobs,
  getRecommendedCandidates
};
