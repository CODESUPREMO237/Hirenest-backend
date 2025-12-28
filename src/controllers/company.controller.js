const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');
const logger = require('../config/logger');

/**
 * Create company profile (Employers only)
 */
const createCompany = async (req, res) => {
  try {
   const userId = req.user._id;
    let companyData = { ...req.body };

    // 1. FIX: If locations comes as a string from Flutter, parse it
    if (typeof companyData.locations === 'string') {
      try {
        companyData.locations = JSON.parse(companyData.locations);
      } catch (e) {
        // If it's not valid JSON, it might be the multipart nested format
        // No action needed if your middleware handles nested objects
      }
    }

    // Check if employer already has a company
    const existingCompany = await Company.findOne({ createdBy: userId });
    if (existingCompany) {
      return res.status(400).json({
        status: 'error',
        message: 'You already have a company profile. Use update instead.'
      });
    }

    // Handle logo upload if present
    if (req.files?.logo) {
      companyData.logo = req.files.logo[0].path;
    }

    // Handle banner upload if present
    if (req.files?.banner) {
      companyData.banner = req.files.banner[0].path;
    }

    // Handle multiple images
    if (req.files?.images) {
      companyData.images = req.files.images.map(file => ({
        url: file.path,
        caption: ''
      }));
    }

    // Create company
    const company = await Company.create({
      ...companyData,
      createdBy: userId,
      admins: [userId]
    });

    // Update user's employer profile
    await User.findByIdAndUpdate(userId, {
      'employerProfile.company': company._id
    });

    res.status(201).json({
      status: 'success',
      message: 'Company created successfully',
      data: { company }
    });
  } catch (error) {
    logger.error('Error creating company:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Company name already exists'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Error creating company',
      error: error.message
    });
  }
};

/**
 * Get all companies with pagination
 */
const getAllCompanies = async (req, res) => {
  try {
    const {
      search,
      industry,
      companySize,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {
      isActive: true,
      deletedAt: null
    };

    // Search
    if (search) {
      query.$text = { $search: search };
    }

    // Industry filter
    if (industry) {
      query.industry = industry;
    }

    // Company size filter
    if (companySize) {
      query.companySize = companySize;
    }

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const companies = await Company.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'profile email');

    const total = await Company.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        companies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching companies:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching companies'
    });
  }
};

/**
 * Get company by ID
 */
const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await Company.findOne({
      _id: id,
      isActive: true,
      deletedAt: null
    })
      .populate('createdBy', 'profile email')
      .populate('admins', 'profile email');

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found'
      });
    }

    // Get active jobs count
    const activeJobsCount = await Job.countDocuments({
      company: id,
      status: 'active',
      deletedAt: null
    });

    company.stats.activeJobs = activeJobsCount;
    await company.save();

    res.status(200).json({
      status: 'success',
      data: { company }
    });
  } catch (error) {
    logger.error('Error fetching company:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching company'
    });
  }
};

/**
 * Get company by slug
 */
const getCompanyBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const company = await Company.findOne({
      slug,
      isActive: true,
      deletedAt: null
    })
      .populate('createdBy', 'profile email');

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { company }
    });
  } catch (error) {
    logger.error('Error fetching company:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching company'
    });
  }
};

/**
 * Update company (Admin only)
 */
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user._id;

// FIX 1: Parse locations if it's sent as a string
    if (typeof req.body.locations === 'string') {
      try {
        updates.locations = JSON.parse(req.body.locations);
      } catch (e) {
        return res.status(400).json({ status: 'error', message: 'Invalid locations format' });
      }
    }

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found'
      });
    }

    // Check if user is admin
    const isAdmin = company.admins.some(admin => admin.toString() === userId.toString());
    const isCreator = company.createdBy.toString() === userId.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        status: 'error',
        message: 'Only company admins can update the profile'
      });
    }

    // Handle file uploads
    if (req.files?.logo) {
      updates.logo = req.files.logo[0].path;
    }

    if (req.files?.banner) {
      updates.banner = req.files.banner[0].path;
    }

    if (req.files?.images) {
      const newImages = req.files.images.map(file => ({
        url: file.path,
        caption: ''
      }));
      updates.images = [...(company.images || []), ...newImages];
    }

    // Update company
    Object.keys(updates).forEach(key => {
      company[key] = updates[key];
    });

    await company.save();

    res.status(200).json({
      status: 'success',
      message: 'Company updated successfully',
      data: { company }
    });
  } catch (error) {
    logger.error('Error updating company:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating company',
      error: error.message
    });
  }
};

/**
 * Delete company (Creator only)
 */
const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found'
      });
    }

    if (company.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the company creator can delete it'
      });
    }

    // Soft delete
    company.deletedAt = new Date();
    company.isActive = false;
    await company.save();

    res.status(200).json({
      status: 'success',
      message: 'Company deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting company:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting company'
    });
  }
};

/**
 * Get my company
 */
const getMyCompany = async (req, res) => {
  try {
    const userId = req.user._id;

    const company = await Company.findOne({
      $or: [
        { createdBy: userId },
        { admins: userId }
      ],
      deletedAt: null
    })
      .populate('createdBy', 'profile email')
      .populate('admins', 'profile email');

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found. Create one to get started.'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { company }
    });
  } catch (error) {
    logger.error('Error fetching company:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching company'
    });
  }
};

/**
 * Add company admin
 */
const addAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: newAdminId } = req.body;
    const currentUserId = req.user._id;

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found'
      });
    }

    // Only creator can add admins
    if (company.createdBy.toString() !== currentUserId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the company creator can add admins'
      });
    }

    // Check if user is already an admin
    if (company.admins.includes(newAdminId)) {
      return res.status(400).json({
        status: 'error',
        message: 'User is already an admin'
      });
    }

    // Verify new admin is an employer
    const newAdmin = await User.findById(newAdminId);
    if (!newAdmin || newAdmin.role !== 'employer') {
      return res.status(400).json({
        status: 'error',
        message: 'User must be an employer'
      });
    }

    company.admins.push(newAdminId);
    await company.save();

    res.status(200).json({
      status: 'success',
      message: 'Admin added successfully',
      data: { company }
    });
  } catch (error) {
    logger.error('Error adding admin:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error adding admin'
    });
  }
};

/**
 * Remove company admin
 */
const removeAdmin = async (req, res) => {
  try {
    const { id, adminId } = req.params;
    const currentUserId = req.user._id;

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        status: 'error',
        message: 'Company not found'
      });
    }

    if (company.createdBy.toString() !== currentUserId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the company creator can remove admins'
      });
    }

    // Cannot remove creator
    if (company.createdBy.toString() === adminId) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot remove company creator'
      });
    }

    company.admins = company.admins.filter(admin => admin.toString() !== adminId);
    await company.save();

    res.status(200).json({
      status: 'success',
      message: 'Admin removed successfully',
      data: { company }
    });
  } catch (error) {
    logger.error('Error removing admin:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error removing admin'
    });
  }
};

/**
 * Get company jobs
 */
const getCompanyJobs = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const query = {
      company: id,
      deletedAt: null
    };

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(query)
      .populate('company postedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Job.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching company jobs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching jobs'
    });
  }
};

/**
 * Get industries
 */
const getIndustries = async (req, res) => {
  try {
    const industries = await Company.distinct('industry', {
      isActive: true,
      deletedAt: null
    });

    res.status(200).json({
      status: 'success',
      data: { industries }
    });
  } catch (error) {
    logger.error('Error fetching industries:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching industries'
    });
  }
};

module.exports = {
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
};