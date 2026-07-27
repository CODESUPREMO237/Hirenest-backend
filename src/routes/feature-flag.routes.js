// ============================================================================
// FEATURE FLAG ROUTES
// src/routes/feature-flag.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const {
  getMyFlags,
  listFlags,
  createFlag,
  updateFlag,
  deleteFlag
} = require('../controllers/feature-flag.controller');
const { authenticate, adminOnly } = require('../middleware/auth.middleware');

// User route — get resolved flags
router.get('/mine', authenticate, getMyFlags);

// Admin routes
router.get('/', authenticate, adminOnly, listFlags);
router.post('/', authenticate, adminOnly, createFlag);
router.put('/:id', authenticate, adminOnly, updateFlag);
router.delete('/:id', authenticate, adminOnly, deleteFlag);

module.exports = router;
