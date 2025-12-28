// ==================== COMPANY ROUTES (ORDER FIXED) ====================
// src/routes/company.routes.js

const express = require('express');
const router = express.Router();
const {
  createCompany,
  getAllCompanies,
  getCompanyById,
  getCompanyBySlug,
  updateCompany,
  deleteCompany,
  getMyCompany,
  addAdmin,
  removeAdmin,
  getCompanyJobs,
  getIndustries
} = require('../controllers/company.controller');

const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadProductImage } = require('../middleware/upload.middleware');

// --- 1. STATIC/SPECIFIC ROUTES FIRST ---

// Public static routes
router.get('/industries', getIndustries);

// Protected static routes
// IMPORTANT: This MUST be above /:id so Express doesn't treat 'my-company' as an ID
router.get('/my-company', authenticate, authorize('employer'), getMyCompany);

// --- 2. BASE COLLECTION ROUTES ---

router.get('/', getAllCompanies);

router.post(
  '/',
  authenticate,
  authorize('employer'),
  uploadProductImage.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'images', maxCount: 5 }
  ]),
  createCompany
);

// --- 3. DYNAMIC PARAMETER ROUTES LAST ---

// Routes with specific identifiers (slugs)
router.get('/slug/:slug', getCompanyBySlug);

// Routes with ID parameters (General ID routes at the bottom)
router.get('/:id', getCompanyById);
router.get('/:id/jobs', getCompanyJobs);

router.put(
  '/:id',
  authenticate,
  authorize('employer'),
  uploadProductImage.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'images', maxCount: 5 }
  ]),
  updateCompany
);

router.delete('/:id', authenticate, authorize('employer'), deleteCompany);
router.post('/:id/admins', authenticate, authorize('employer'), addAdmin);
router.delete('/:id/admins/:adminId', authenticate, authorize('employer'), removeAdmin);

module.exports = router;