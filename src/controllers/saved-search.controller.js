// ============================================================================
// SAVED SEARCH CONTROLLER
// src/controllers/saved-search.controller.js
// ============================================================================

const SavedSearch = require('../models/SavedSearch');
const logger = require('../config/logger');

/**
 * Save a search
 */
const saveSearch = async (req, res) => {
  try {
    const { searchType, name, criteria, alertsEnabled } = req.body;

    // Limit saved searches per user
    const count = await SavedSearch.countDocuments({ user: req.user._id });
    if (count >= 20) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum of 20 saved searches reached. Delete one first.'
      });
    }

    const savedSearch = await SavedSearch.create({
      user: req.user._id,
      searchType,
      name,
      criteria,
      alertsEnabled: alertsEnabled !== false
    });

    res.status(201).json({
      status: 'success',
      message: 'Search saved.',
      data: { savedSearch }
    });
  } catch (error) {
    logger.error('Error saving search:', error);
    res.status(500).json({ status: 'error', message: 'Error saving search' });
  }
};

/**
 * Get my saved searches
 */
const getMySavedSearches = async (req, res) => {
  try {
    const { searchType } = req.query;
    const query = { user: req.user._id };
    if (searchType) query.searchType = searchType;

    const savedSearches = await SavedSearch.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: { savedSearches }
    });
  } catch (error) {
    logger.error('Error fetching saved searches:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching saved searches' });
  }
};

/**
 * Update a saved search
 */
const updateSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, criteria, alertsEnabled } = req.body;

    const savedSearch = await SavedSearch.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { $set: { name, criteria, alertsEnabled } },
      { new: true }
    );

    if (!savedSearch) {
      return res.status(404).json({ status: 'error', message: 'Saved search not found' });
    }

    res.status(200).json({
      status: 'success',
      data: { savedSearch }
    });
  } catch (error) {
    logger.error('Error updating saved search:', error);
    res.status(500).json({ status: 'error', message: 'Error updating saved search' });
  }
};

/**
 * Delete a saved search
 */
const deleteSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await SavedSearch.findOneAndDelete({ _id: id, user: req.user._id });
    if (!result) {
      return res.status(404).json({ status: 'error', message: 'Saved search not found' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Saved search deleted.'
    });
  } catch (error) {
    logger.error('Error deleting saved search:', error);
    res.status(500).json({ status: 'error', message: 'Error deleting saved search' });
  }
};

module.exports = {
  saveSearch,
  getMySavedSearches,
  updateSavedSearch,
  deleteSavedSearch
};
