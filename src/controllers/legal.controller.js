// ============================================================================
// LEGAL CONTROLLER — ToS / Privacy Versioned Acceptance
// src/controllers/legal.controller.js
// ============================================================================

const User = require('../models/User');
const logger = require('../config/logger');

// Current required versions (bump these when ToS/Privacy change)
const CURRENT_VERSIONS = {
  tosVersion: '1.0',
  privacyVersion: '1.0'
};

/**
 * Get required legal versions and user's acceptance status
 */
const getLegalStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('legalAcceptance');

    const acceptance = user?.legalAcceptance || {};
    const needsAcceptance =
      acceptance.tosVersion !== CURRENT_VERSIONS.tosVersion ||
      acceptance.privacyVersion !== CURRENT_VERSIONS.privacyVersion;

    res.status(200).json({
      status: 'success',
      data: {
        currentVersions: CURRENT_VERSIONS,
        userAcceptance: acceptance,
        needsAcceptance
      }
    });
  } catch (error) {
    logger.error('Error fetching legal status:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching legal status' });
  }
};

/**
 * Accept the current ToS and Privacy versions
 */
const acceptLegal = async (req, res) => {
  try {
    const { tosVersion, privacyVersion } = req.body;

    // Validate that they're accepting the CURRENT versions
    if (tosVersion !== CURRENT_VERSIONS.tosVersion || privacyVersion !== CURRENT_VERSIONS.privacyVersion) {
      return res.status(400).json({
        status: 'error',
        message: 'You must accept the current versions.',
        data: { requiredVersions: CURRENT_VERSIONS }
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        'legalAcceptance.tosVersion': tosVersion,
        'legalAcceptance.tosAcceptedAt': new Date(),
        'legalAcceptance.privacyVersion': privacyVersion,
        'legalAcceptance.privacyAcceptedAt': new Date()
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Legal terms accepted.',
      data: { acceptedVersions: CURRENT_VERSIONS }
    });
  } catch (error) {
    logger.error('Error accepting legal:', error);
    res.status(500).json({ status: 'error', message: 'Error accepting terms' });
  }
};

module.exports = {
  getLegalStatus,
  acceptLegal,
  CURRENT_VERSIONS
};
