const Product = require('../models/Product');
const User = require('../models/User');
const logger = require('../config/logger');
const { deleteFromCloudinary, deleteMultipleFromCloudinary } = require('../middleware/upload.middleware');

/**
 * HELPER: Normalizes nested objects from multipart/form-data
 * Handles cases where fields arrive as JSON strings or raw objects.
 */
const normalizeBody = (body) => {
  const data = { ...body };
  const nestedFields = ['location', 'price', 'stock'];

  nestedFields.forEach(field => {
    if (data[field]) {
      if (typeof data[field] === 'string') {
        try {
          data[field] = JSON.parse(data[field]);
        } catch (e) {
          logger.warn(`Failed to parse ${field} string, using raw value`);
        }
      }
    }
  });

  // Handle root-level coordinates from Flutter/Dio
  if (data.longitude && data.latitude) {
    const lon = parseFloat(data.longitude);
    const lat = parseFloat(data.latitude);
    if (!isNaN(lon) && !isNaN(lat)) {
      data.location = data.location || {};
      data.location.coordinates = {
        type: 'Point',
        coordinates: [lon, lat]
      };
    }
    delete data.longitude;
    delete data.latitude;
  }

  // Sanitize Booleans (multipart sends "true" as a string)
  if (data.location) {
    if (data.location.canShip !== undefined) data.location.canShip = String(data.location.canShip) === 'true';
    if (data.location.pickupAvailable !== undefined) data.location.pickupAvailable = String(data.location.pickupAvailable) === 'true';
  }
  if (data.price && data.price.negotiable !== undefined) {
    data.price.negotiable = String(data.price.negotiable) === 'true';
  }
  if (data.stock && data.stock.available !== undefined) {
    data.stock.available = String(data.stock.available) === 'true';
  }

  return data;
};

/**
 * Create new product
 */
const createProduct = async (req, res) => {
  try {
    const userId = req.user._id;
    const productData = normalizeBody(req.body);

    if (!req.user.canPostToMarketplace()) {
      return res.status(403).json({
        status: 'error',
        message: 'Only registered users can post products'
      });
    }

    // Handle multiple image uploads from Cloudinary
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map((file, index) => ({
        url: file.path, // Cloudinary URL
        publicId: file.filename, // Cloudinary public_id
        isPrimary: index === 0,
        order: index
      }));
    }

    const product = await Product.create({
      ...productData,
      seller: userId,
      sellerRole: req.user.role,
      images,
      status: 'active'
    });

    await User.findByIdAndUpdate(userId, {
      $inc: { 'marketplaceStats.productsPosted': 1, 'marketplaceStats.activeProducts': 1 }
    });

    await product.populate('seller', 'profile email role marketplaceStats');

    res.status(201).json({
      status: 'success',
      message: 'Product created successfully',
      data: { product }
    });
  } catch (error) {
    logger.error('Error creating product:', error);
    
    // Clean up uploaded images from Cloudinary if product creation fails
    if (req.files && req.files.length > 0) {
      const publicIds = req.files.map(file => file.filename);
      try {
        await deleteMultipleFromCloudinary(publicIds, 'image');
      } catch (cleanupError) {
        logger.error('Error cleaning up Cloudinary images:', cleanupError);
      }
    }
    
    const message = error.name === 'ValidationError' ? error.message : 'Error creating product';
    res.status(error.name === 'ValidationError' ? 400 : 500).json({
      status: 'error',
      message,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all products with filters and pagination
 */
const getAllProducts = async (req, res) => {
  try {
    const {
      search, category, minPrice, maxPrice, condition,
      location, seller, availableOnly, page = 1, limit = 20,
      sortBy = 'createdAt', sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const filters = {
      search, category,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      condition, location, seller,
      availableOnly: availableOnly === 'true'
    };

    let query = Product.searchProducts(filters);
    const sortField = ['createdAt', 'price.amount', 'name', 'stats.views'].includes(sortBy) ? sortBy : 'createdAt';
    query = query.sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 });

    const skip = (pageNum - 1) * limitNum;
    const products = await query.skip(skip).limit(limitNum).populate('seller', 'profile email role marketplaceStats').lean();
    
    const countQuery = Product.searchProducts(filters);
    const total = await Product.countDocuments(countQuery.getQuery());

    res.status(200).json({
      status: 'success',
      data: {
        products,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
      }
    });
  } catch (error) {
    logger.error('Error fetching products:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching products' });
  }
};

/**
 * Get single product by ID
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ status: 'error', message: 'Invalid product ID format' });
    }

    const product = await Product.findOne({ _id: id, deletedAt: null }).populate('seller', 'profile email role marketplaceStats');
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found' });

    if (req.user) await product.incrementViews(req.user._id);

    res.status(200).json({ status: 'success', data: { product } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error fetching product' });
  }
};

/**
 * Update product (owner only)
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = normalizeBody(req.body);
    const userId = req.user._id;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found' });
    if (!product.isOwnedBy(userId)) return res.status(403).json({ status: 'error', message: 'Unauthorized' });

    // Handle image updates
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file, index) => ({
        url: file.path, // Cloudinary URL
        publicId: file.filename, // Cloudinary public_id
        isPrimary: product.images.length === 0 && index === 0,
        order: product.images.length + index
      }));
      updates.images = [...product.images, ...newImages];
    }

    // Handle image deletion if specified
    if (updates.deleteImages && Array.isArray(updates.deleteImages)) {
      const imagesToDelete = product.images.filter(img => 
        updates.deleteImages.includes(img.publicId)
      );
      
      // Delete from Cloudinary
      const publicIds = imagesToDelete.map(img => img.publicId);
      if (publicIds.length > 0) {
        try {
          await deleteMultipleFromCloudinary(publicIds, 'image');
        } catch (cloudinaryError) {
          logger.error('Error deleting images from Cloudinary:', cloudinaryError);
        }
      }
      
      // Remove from product
      updates.images = product.images.filter(img => 
        !updates.deleteImages.includes(img.publicId)
      );
      
      delete updates.deleteImages;
    }

    Object.assign(product, updates);
    await product.save();
    await product.populate('seller', 'profile email role marketplaceStats');

    res.status(200).json({ status: 'success', data: { product } });
  } catch (error) {
    logger.error('Error updating product:', error);
    res.status(500).json({ status: 'error', message: 'Error updating product' });
  }
};

/**
 * Delete product (owner only)
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    // Check ownership
    if (!product.isOwnedBy(userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only delete your own products'
      });
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      const publicIds = product.images.map(img => img.publicId);
      try {
        await deleteMultipleFromCloudinary(publicIds, 'image');
        logger.info(`Deleted ${publicIds.length} images from Cloudinary for product ${id}`);
      } catch (cloudinaryError) {
        logger.error('Error deleting images from Cloudinary:', cloudinaryError);
        // Continue with soft delete even if Cloudinary deletion fails
      }
    }

    // Soft delete
    product.deletedAt = new Date();
    product.status = 'inactive';
    await product.save();

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: {
        'marketplaceStats.activeProducts': -1
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting product:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get my products
 */
const getMyProducts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const query = {
      seller: userId,
      deletedAt: null
    };

    if (status) {
      query.status = status;
    }

    const skip = (pageNum - 1) * limitNum;

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Product.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        products: products || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total || 0,
          pages: Math.ceil((total || 0) / limitNum) || 0
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching my products:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      data: {
        products: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 0
        }
      }
    });
  }
};

/**
 * Get products by seller ID
 */
const getProductsBySeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Validate ObjectId format
    if (!sellerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid seller ID format'
      });
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const skip = (pageNum - 1) * limitNum;

    const products = await Product.findBySeller(sellerId, false)
      .skip(skip)
      .limit(limitNum)
      .populate('seller', 'profile role marketplaceStats')
      .lean();

    const total = await Product.countDocuments({
      seller: sellerId,
      status: 'active',
      deletedAt: null
    });

    res.status(200).json({
      status: 'success',
      data: {
        products: products || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total || 0,
          pages: Math.ceil((total || 0) / limitNum) || 0
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching seller products:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      data: {
        products: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 0
        }
      }
    });
  }
};

/**
 * Mark product as sold
 */
const markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    if (!product.isOwnedBy(userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only update your own products'
      });
    }

    await product.markAsSold();

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: {
        'marketplaceStats.activeProducts': -1
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Product marked as sold',
      data: { product }
    });
  } catch (error) {
    logger.error('Error marking product as sold:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get nearby products (geo-location)
 */
const getNearbyProducts = async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 50000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        status: 'error',
        message: 'Longitude and latitude are required'
      });
    }

    // Validate coordinates
    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid longitude or latitude'
      });
    }

    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return res.status(400).json({
        status: 'error',
        message: 'Longitude must be between -180 and 180, latitude between -90 and 90'
      });
    }

    const products = await Product.findNearby(
      lng,
      lat,
      parseInt(maxDistance)
    );

    res.status(200).json({
      status: 'success',
      data: { products: products || [] }
    });
  } catch (error) {
    logger.error('Error fetching nearby products:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      data: { products: [] }
    });
  }
};

/**
 * Get product categories
 */
const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category', {
      status: 'active',
      deletedAt: null
    });

    res.status(200).json({
      status: 'success',
      data: { categories: categories || [] }
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      data: { categories: [] }
    });
  }
};

/**
 * Report product
 */
const reportProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid product ID format'
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Report reason is required'
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    // Check if user already reported this product
    const alreadyReported = product.reports.some(
      report => report.reportedBy.toString() === userId.toString()
    );

    if (alreadyReported) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reported this product'
      });
    }

    // Add report
    product.reports.push({
      reportedBy: userId,
      reason: reason.trim(),
      createdAt: new Date()
    });

    product.isReported = true;

    await product.save();

    res.status(200).json({
      status: 'success',
      message: 'Product reported successfully'
    });
  } catch (error) {
    logger.error('Error reporting product:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error reporting product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
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
};