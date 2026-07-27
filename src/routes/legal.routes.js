// ============================================================================
// LEGAL ROUTES
// src/routes/legal.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();
const { getLegalStatus, acceptLegal } = require('../controllers/legal.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/status', getLegalStatus);
router.post('/accept', acceptLegal);

module.exports = router;
