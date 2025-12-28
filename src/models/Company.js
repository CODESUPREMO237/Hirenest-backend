const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    unique: true
  },

  description: {
    type: String,
    maxlength: 2000
  },

  tagline: {
    type: String,
    maxlength: 200
  },

  // Contact Information
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  phone: String,
  website: String,

  // Location
  headquarters: {
    address: String,
    city: String,
    state: String,
    country: String,
    zipCode: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere'
      }
    }
  },

  // Additional Locations
  locations: [{
    name: String,
    address: String,
    city: String,
    state: String,
    country: String
  }],

  // Branding
  logo: String,
  banner: String,
  images: [{
    url: String,
    caption: String
  }],

  // Company Details
  industry: String,
  
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+']
  },

  foundedYear: Number,

  companyType: {
    type: String,
    enum: ['startup', 'small_business', 'mid_market', 'enterprise', 'non_profit', 'government']
  },

  // Social Media
  socialMedia: {
    linkedin: String,
    twitter: String,
    facebook: String,
    instagram: String,
    youtube: String
  },

  // Statistics
  stats: {
    activeJobs: {
      type: Number,
      default: 0
    },
    totalEmployees: {
      type: Number,
      default: 0
    },
    followers: {
      type: Number,
      default: 0
    }
  },

  // Benefits & Culture
  benefits: [{
    type: String,
    trim: true
  }],

  culture: {
    values: [String],
    perks: [String]
  },

  // Verification
  verified: {
    type: Boolean,
    default: false
  },

  verificationDocuments: [{
    type: String,
    url: String,
    uploadedAt: Date
  }],

  // Owner/Admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // SEO
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },

  // Soft delete
  deletedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

// Indexes
companySchema.index({ name: 'text', description: 'text' });
companySchema.index({ industry: 1 });
companySchema.index({ createdBy: 1 });

// Generate slug before saving
companySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Virtual for followers count
companySchema.virtual('jobs', {
  ref: 'Job',
  localField: '_id',
  foreignField: 'company',
  count: true
});

const Company = mongoose.model('Company', companySchema);

module.exports = Company;