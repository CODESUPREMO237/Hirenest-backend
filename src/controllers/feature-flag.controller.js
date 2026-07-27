// ============================================================================
// FEATURE FLAG CONTROLLER
// src/controllers/feature-flag.controller.js
// ============================================================================

const FeatureFlag = require('../models/FeatureFlag');
const featureFlagService = require('../services/feature-flag.service');
const logger = require('../config/logger');

/**
 * Get resolved flags for the authenticated user (client sync)
 */
const getMyFlags = async (req, res) => {
  try {
    const flags = await featureFlagService.getFlagsForUser(req.user);
    res.status(200).json({ status: 'success', data: { flags } });
  } catch (error) {
    logger.error('Error fetching flags:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching flags' });
  }
};

/**
 * Admin: List all flags (raw)
 */
const listFlags = async (req, res) => {
  try {
    const flags = await FeatureFlag.find({}).sort({ key: 1 });
    res.status(200).json({ status: 'success', data: { flags } });
  } catch (error) {
    logger.error('Error listing flags:', error);
    res.status(500).json({ status: 'error', message: 'Error listing flags' });
  }
};

/**
 * Admin: Create a flag
 */
const createFlag = async (req, res) => {
  try {
    const flag = await FeatureFlag.create(req.body);
    featureFlagService.invalidateCache();
    res.status(201).json({ status: 'success', data: { flag } });
  } catch (error) {
    logger.error('Error creating flag:', error);
    res.status(500).json({ status: 'error', message: 'Error creating flag' });
  }
};

/**
 * Admin: Update a flag
 */
const updateFlag = async (req, res) => {
  try {
    const { id } = req.params;
    const flag = await FeatureFlag.findByIdAndUpdate(id, req.body, { new: true });
    if (!flag) {
      return res.status(404).json({ status: 'error', message: 'Flag not found' });
    }
    featureFlagService.invalidateCache();
    res.status(200).json({ status: 'success', data: { flag } });
  } catch (error) {
    logger.error('Error updating flag:', error);
    res.status(500).json({ status: 'error', message: 'Error updating flag' });
  }
};

/**
 * Admin: Delete a flag
 */
const deleteFlag = async (req, res) => {
  try {
    const { id } = req.params;
    await FeatureFlag.findByIdAndDelete(id);
    featureFlagService.invalidateCache();
    res.status(200).json({ status: 'success', message: 'Flag deleted.' });
  } catch (error) {
    logger.error('Error deleting flag:', error);
    res.status(500).json({ status: 'error', message: 'Error deleting flag' });
  }
};

module.exports = {
  getMyFlags,
  listFlags,
  createFlag,
  updateFlag,
  deleteFlag
};
