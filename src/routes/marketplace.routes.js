// ==================== MARKETPLACE ROUTES ====================
// src/routes/marketplace.routes.js

const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getMyProducts,
  getProductsBySeller,
  markAsSold,
  getNearbyProducts,
  getCategories,
  reportProduct
} = require('../controllers/marketplace.controller');

const {
  authenticate,
  authorize,
  optionalAuthenticate
} = require('../middleware/auth.middleware');

const { uploadProductImage } = require('../middleware/upload.middleware');
const { validate, createProductSchema, updateProductSchema } = require('../middleware/validation.middleware');

// Public routes - SPECIFIC PATHS FIRST!
router.get('/products/nearby', optionalAuthenticate, getNearbyProducts);
router.get('/categories', getCategories);
router.get('/products', optionalAuthenticate, getAllProducts);

// Protected routes (Job Seekers and Employers only) - SPECIFIC PATHS FIRST!
router.post('/products', authenticate, authorize('jobseeker', 'employer'), uploadProductImage.array('images', 5), validate(createProductSchema), createProduct);
router.get('/my-products', authenticate, authorize('jobseeker', 'employer'), getMyProducts);

// Routes with :sellerId parameter
router.get('/products/seller/:sellerId', optionalAuthenticate, getProductsBySeller);

// Routes with :id parameter - THESE MUST COME LAST!
router.get('/products/:id', optionalAuthenticate, getProductById);
router.put('/products/:id', authenticate, authorize('jobseeker', 'employer'), uploadProductImage.array('images', 5), validate(updateProductSchema), updateProduct);
router.delete('/products/:id', authenticate, authorize('jobseeker', 'employer'), deleteProduct);
router.put('/products/:id/mark-sold', authenticate, authorize('jobseeker', 'employer'), markAsSold);
router.post('/products/:id/report', authenticate, reportProduct);

module.exports = router;