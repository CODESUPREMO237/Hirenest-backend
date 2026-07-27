const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Name cannot exceed 200 characters']
  },

  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },

  // Seller Information (Can be Job Seeker OR Employer)
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  sellerRole: {
    type: String,
    enum: ['jobseeker', 'employer'],
    required: true
  },

  // Category & Classification
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },

  subCategory: {
    type: String,
    trim: true
  },

  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],

  // Pricing
  price: {
    amount: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    negotiable: {
      type: Boolean,
      default: false
    }
  },

  // Images
  images: [{
    url: {
      type: String,
      required: true
    },
    publicId: String, // For Cloudinary
    isPrimary: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],

  // Condition (for used items)
  condition: {
    type: String,
    enum: ['new', 'like_new', 'good', 'fair', 'poor'],
    default: 'new'
  },

  // Location - coordinates are now optional
  location: {
    city: {
      type: String,
      required: [true, 'City is required']
    },
    state: String,
    country: {
      type: String,
      required: [true, 'Country is required']
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: {
        type: [Number] // [longitude, latitude]
      }
    },
    canShip: {
      type: Boolean,
      default: false
    },
    pickupAvailable: {
      type: Boolean,
      default: true
    }
  },

  // Availability
  status: {
    type: String,
    enum: ['draft', 'active', 'sold', 'reserved', 'inactive'],
    default: 'active',
    index: true
  },

  stock: {
    available: {
      type: Boolean,
      default: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0
    }
  },

  // Visibility
  visibility: {
    type: String,
    enum: ['public', 'unlisted', 'private'],
    default: 'public'
  },

  featured: {
    type: Boolean,
    default: false
  },

  // Contact Preferences
  contactPreferences: {
    allowChat: {
      type: Boolean,
      default: true
    },
    showPhone: {
      type: Boolean,
      default: false
    },
    showEmail: {
      type: Boolean,
      default: false
    }
  },

  // Statistics
  stats: {
    views: {
      type: Number,
      default: 0
    },
    uniqueViews: {
      type: Number,
      default: 0
    },
    chatInitiated: {
      type: Number,
      default: 0
    },
    saves: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    }
  },

  // SEO & Discovery
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },

  // Reporting & Moderation
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  isReported: {
    type: Boolean,
    default: false
  },

  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'approved'
  },

  // Timestamps
  publishedAt: Date,
  soldAt: Date,
  expiresAt: Date,

  // Boosted listing (Phase 9)
  isBoosted: {
    type: Boolean,
    default: false
  },
  boostedUntil: Date,

  // Soft delete
  deletedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ seller: 1 });
productSchema.index({ status: 1, visibility: 1 });
productSchema.index({ category: 1, subCategory: 1 });
productSchema.index({ 'price.amount': 1 });
// CRITICAL: Sparse index allows documents without coordinates to be saved
productSchema.index({ 'location.coordinates': '2dsphere' }, { sparse: true });
productSchema.index({ createdAt: -1 });
productSchema.index({ featured: -1, createdAt: -1 });
productSchema.index({ deletedAt: 1 });

// Virtual for primary image
productSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary || this.images[0] || null;
});

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  
  // Set published date when status becomes active
  if (this.isModified('status') && this.status === 'active' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Method to check if user owns this product
productSchema.methods.isOwnedBy = function(userId) {
  return this.seller.toString() === userId.toString();
};

// Method to check if product is available for chat
productSchema.methods.isAvailableForChat = function() {
  return (
    this.status === 'active' && 
    this.visibility === 'public' &&
    this.contactPreferences.allowChat &&
    !this.deletedAt
  );
};

// Method to increment view count
productSchema.methods.incrementViews = async function(userId) {
  this.stats.views += 1;
  
  // Track unique views (simplified - in production, use Redis or separate collection)
  if (userId) {
    this.stats.uniqueViews += 1;
  }
  
  return await this.save();
};

// Method to mark as sold
productSchema.methods.markAsSold = async function() {
  this.status = 'sold';
  this.soldAt = new Date();
  this.stock.available = false;
  this.stock.quantity = 0;
  return await this.save();
};

// Static method to find active products
productSchema.statics.findActive = function() {
  return this.find({ 
    status: 'active', 
    visibility: 'public',
    deletedAt: null,
    'stock.available': true
  }).populate('seller', 'profile email role marketplaceStats');
};

// Static method for product search with filters - ENHANCED
productSchema.statics.searchProducts = function(filters = {}) {
  const query = { 
    status: 'active', 
    visibility: 'public',
    deletedAt: null
  };

  try {
    // Text search
    if (filters.search && filters.search.trim()) {
      query.$text = { $search: filters.search.trim() };
    }

    // Category filter
    if (filters.category && filters.category.trim()) {
      query.category = filters.category.trim();
    }

    // Price range filter
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query['price.amount'] = {};
      if (filters.minPrice !== undefined && !isNaN(filters.minPrice)) {
        query['price.amount'].$gte = parseFloat(filters.minPrice);
      }
      if (filters.maxPrice !== undefined && !isNaN(filters.maxPrice)) {
        query['price.amount'].$lte = parseFloat(filters.maxPrice);
      }
      // Remove empty price query if both are undefined
      if (Object.keys(query['price.amount']).length === 0) {
        delete query['price.amount'];
      }
    }

    // Condition filter
    if (filters.condition && filters.condition.trim()) {
      query.condition = filters.condition.trim();
    }

    // Location filter (case-insensitive, searches city, state, country)
    if (filters.location && filters.location.trim()) {
      query.$or = [
        { 'location.city': new RegExp(filters.location.trim(), 'i') },
        { 'location.state': new RegExp(filters.location.trim(), 'i') },
        { 'location.country': new RegExp(filters.location.trim(), 'i') }
      ];
    }

    // Seller filter
    if (filters.seller) {
      query.seller = filters.seller;
    }

    // Availability filter
    if (filters.availableOnly === true) {
      query['stock.available'] = true;
    }

    return this.find(query);
  } catch (error) {
    console.error('Error building search query:', error);
    // Return a basic query if filter building fails
    return this.find({
      status: 'active',
      visibility: 'public',
      deletedAt: null
    });
  }
};

// Static method to get products by seller
productSchema.statics.findBySeller = function(sellerId, includeInactive = false) {
  const query = { 
    seller: sellerId,
    deletedAt: null
  };

  if (!includeInactive) {
    query.status = 'active';
  }

  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get nearby products (geo-location)
productSchema.statics.findNearby = function(longitude, latitude, maxDistance = 50000) {
  return this.find({
    status: 'active',
    visibility: 'public',
    deletedAt: null,
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance // in meters
      }
    }
  }).populate('seller', 'profile email role');
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;