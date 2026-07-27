// ============================================================================
// SAVED SEARCH ROUTES
// src/routes/saved-search.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const {
  saveSearch,
  getMySavedSearches,
  updateSavedSearch,
  deleteSavedSearch
} = require('../controllers/saved-search.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.post('/', saveSearch);
router.get('/', getMySavedSearches);
router.put('/:id', updateSavedSearch);
router.delete('/:id', deleteSavedSearch);

module.exports = router;
