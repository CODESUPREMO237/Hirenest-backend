const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },

  description: {
    type: String,
    required: [true, 'Job description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },

  // Company & Employer
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },

  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Job Details
  jobType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'internship', 'freelance'],
    required: true
  },

  category: {
    type: String,
    required: true,
    trim: true
  },

  subCategory: {
    type: String,
    trim: true
  },

  experienceLevel: {
    type: String,
    enum: ['entry', 'mid', 'senior', 'executive'],
    required: true
  },

  educationLevel: {
    type: String,
    enum: ['high_school', 'bachelors', 'masters', 'phd', 'not_required']
  },

  // Location
  location: {
    type: {
      type: String,
      enum: ['remote', 'onsite', 'hybrid'],
      default: 'onsite'
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
        index: '2dsphere'
      }
    },
    remotePolicy: {
      type: String,
      enum: ['fully_remote', 'partially_remote', 'no_remote']
    }
  },

  // Salary Information
  salary: {
    min: {
      type: Number,
      min: 0
    },
    max: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    period: {
      type: String,
      enum: ['hourly', 'monthly', 'yearly'],
      default: 'yearly'
    },
    negotiable: {
      type: Boolean,
      default: true
    },
    showSalary: {
      type: Boolean,
      default: true
    }
  },

  // Requirements
  requirements: {
    skills: [{
      name: String,
      required: {
        type: Boolean,
        default: true
      },
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert']
      }
    }],
    
    languages: [{
      name: String,
      proficiency: {
        type: String,
        enum: ['basic', 'conversational', 'fluent', 'native']
      }
    }],
    
    certifications: [String],
    
    yearsOfExperience: {
      min: {
        type: Number,
        min: 0,
        default: 0
      },
      max: Number
    }
  },

  // Benefits & Perks
  benefits: [{
    type: String,
    trim: true
  }],

  // Application Details
  applicationDeadline: {
    type: Date
  },

  applicationUrl: {
    type: String,
    trim: true
  },

  applicationEmail: {
    type: String,
    trim: true,
    lowercase: true
  },

  applicationInstructions: {
    type: String,
    maxlength: 1000
  },

  // Questions for applicants
  screeningQuestions: [{
    question: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'yes_no', 'multiple_choice'],
      default: 'text'
    },
    options: [String],
    required: {
      type: Boolean,
      default: false
    }
  }],

  // Status & Visibility
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'closed', 'filled'],
    default: 'active'
  },

  visibility: {
    type: String,
    enum: ['public', 'unlisted', 'private'],
    default: 'public'
  },

  featured: {
    type: Boolean,
    default: false
  },

  urgent: {
    type: Boolean,
    default: false
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
    applications: {
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

  // *** NEW: Track unique viewers ***
  viewedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // SEO & Meta
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },

  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],

  // Timestamps
  publishedAt: Date,
  closedAt: Date,
  expiresAt: Date,

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

// Indexes
jobSchema.index({ title: 'text', description: 'text', tags: 'text' });
jobSchema.index({ company: 1 });
jobSchema.index({ postedBy: 1 });
jobSchema.index({ status: 1, visibility: 1 });
jobSchema.index({ category: 1, subCategory: 1 });
jobSchema.index({ jobType: 1 });
jobSchema.index({ experienceLevel: 1 });
jobSchema.index({ 'location.coordinates': '2dsphere' });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ featured: -1, createdAt: -1 });
jobSchema.index({ applicationDeadline: 1 });
jobSchema.index({ viewedBy: 1 }); // NEW: Index for viewedBy

// Virtual for applications
jobSchema.virtual('applications', {
  ref: 'Application',
  localField: '_id',
  foreignField: 'job',
  count: true
});

// Generate slug before saving
jobSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  next();
});

// Method to check if job is active and accepting applications
jobSchema.methods.isAcceptingApplications = function() {
  if (this.status !== 'active') return false;
  if (this.deletedAt) return false;
  if (this.applicationDeadline && this.applicationDeadline < new Date()) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

// *** UPDATED: Method to increment view count with unique tracking ***
jobSchema.methods.incrementViews = async function(userId) {
  try {
    // Always increment total views
    this.stats.views += 1;
    
    // Track unique views if userId is provided
    if (userId) {
      // Check if user hasn't viewed before
      if (!this.viewedBy.includes(userId)) {
        this.viewedBy.push(userId);
        this.stats.uniqueViews = this.viewedBy.length;
      }
    }
    
    await this.save();
    console.log(`View tracked for job ${this._id}: Total=${this.stats.views}, Unique=${this.stats.uniqueViews}`);
    return this;
  } catch (error) {
    console.error('Error incrementing views:', error);
    throw error;
  }
};

// *** NEW: Method to increment applications count ***
jobSchema.methods.incrementApplications = async function() {
  try {
    this.stats.applications += 1;
    await this.save();
    console.log(`Application count incremented for job ${this._id}: ${this.stats.applications}`);
    return this;
  } catch (error) {
    console.error('Error incrementing applications:', error);
    throw error;
  }
};

// *** NEW: Method to decrement applications count ***
jobSchema.methods.decrementApplications = async function() {
  try {
    if (this.stats.applications > 0) {
      this.stats.applications -= 1;
      await this.save();
      console.log(`Application count decremented for job ${this._id}: ${this.stats.applications}`);
    }
    return this;
  } catch (error) {
    console.error('Error decrementing applications:', error);
    throw error;
  }
};

// Static method to find active jobs
jobSchema.statics.findActive = function() {
  return this.find({ 
    status: 'active', 
    visibility: 'public',
    deletedAt: null,
    $or: [
      { applicationDeadline: { $gte: new Date() } },
      { applicationDeadline: null }
    ]
  });
};

// Static method for job search with filters
jobSchema.statics.searchJobs = function(filters = {}) {
  const query = { 
    status: 'active', 
    visibility: 'public',
    deletedAt: null
  };

  // Text search
  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  // Category filter
  if (filters.category) {
    query.category = filters.category;
  }

  // Job type filter
  if (filters.jobType) {
    query.jobType = { $in: Array.isArray(filters.jobType) ? filters.jobType : [filters.jobType] };
  }

  // Experience level filter
  if (filters.experienceLevel) {
    query.experienceLevel = filters.experienceLevel;
  }

  // Location filter
  if (filters.location) {
    query['location.address.city'] = new RegExp(filters.location, 'i');
  }

  // Salary range filter
  if (filters.minSalary) {
    query['salary.min'] = { $gte: filters.minSalary };
  }

  // Remote filter
  if (filters.remote === true) {
    query['location.type'] = { $in: ['remote', 'hybrid'] };
  }

  return this.find(query).populate('company postedBy');
};

// Post save hook for notifications
jobSchema.post('save', async function(doc) {
  // Only notify for new 'active' jobs
  if (doc.status === 'active' && doc.isNew) {
    try {
      const User = mongoose.model('User');
      const admin = require('../config/firebase');

      // Find users who have jobAlerts enabled and have FCM tokens
      const usersToNotify = await User.find({
        'notificationPreferences.jobAlerts': true,
        'fcmTokens.0': { $exists: true }
      });

      const tokens = usersToNotify.flatMap(user => user.fcmTokens.map(t => t.token));

      if (tokens.length > 0) {
        const companyName = doc.company?.name || 'a company';
        
        const message = {
          notification: {
            title: 'New Job Alert! 🚀',
            body: `${doc.title} at ${companyName}`,
          },
          data: {
            type: 'job',
            jobId: doc._id.toString(),
          },
          tokens: tokens,
        };

        await admin.messaging().sendEachForMulticast(message);
        console.log('Job alerts sent to', tokens.length, 'devices');
      }
    } catch (error) {
      console.error('Error sending job alerts:', error);
    }
  }
});

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;