
// ==================== GUEST ROUTES ====================
// src/routes/guest.routes.js

const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Product = require('../models/Product');
const { checkGuestLimit } = require('../middleware/auth.middleware');

// Guest job browsing
router.get('/jobs', checkGuestLimit('jobsViewed'), async (req, res) => {
  try {
    const jobs = await Job.findActive()
      .limit(10)
      .sort({ createdAt: -1 })
      .populate('company');

    res.status(200).json({
      status: 'success',
      data: { jobs },
      message: 'Register to view unlimited jobs and apply'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching jobs'
    });
  }
});

// Guest product browsing
router.get('/products', checkGuestLimit('productsViewed'), async (req, res) => {
  try {
    const products = await Product.findActive()
      .limit(20)
      .sort({ createdAt: -1 })
      .populate('seller', 'profile role');

    res.status(200).json({
      status: 'success',
      data: { products },
      message: 'Register to post products and chat with sellers'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching products'
    });
  }
});

module.exports = router;