const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Firebase UID (unique identifier from Firebase Auth)
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
   
  },

  // Basic Information
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },

  // User Role: jobseeker, employer (2 roles only)
  role: {
    type: String,
    enum: ['jobseeker', 'employer'],
    required: [true, 'User role is required'],
    default: 'jobseeker'
  },

  // Profile Information
  profile: {
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    displayName: {
      type: String,
      trim: true
    },
    avatar: {
      type: String,
      default: null
    },
    phone: {
      type: String,
      trim: true
    },
    bio: {
      type: String,
      maxlength: 500
    },
    location: {
      city: String,
      state: String,
      country: String,
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [0, 0]
        }
      }
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say']
    }
  },

  // Job Seeker Specific Fields
  jobSeekerProfile: {
    // Resume/CV
    resume: {
      url: String,
      filename: String,
      uploadedAt: Date
    },
    
    // Skills
    skills: [{
      name: String,
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert']
      }
    }],
    
    // Education
    education: [{
      institution: String,
      degree: String,
      fieldOfStudy: String,
      startDate: Date,
      endDate: Date,
      current: Boolean,
      description: String
    }],
    
    // Work Experience
    experience: [{
      company: String,
      position: String,
      startDate: Date,
      endDate: Date,
      current: Boolean,
      description: String,
      location: String
    }],
    
    // Preferences
    preferences: {
      jobTypes: [{
        type: String,
        enum: ['full-time', 'part-time', 'contract', 'internship', 'freelance']
      }],
      expectedSalary: {
        min: Number,
        max: Number,
        currency: {
          type: String,
          default: 'USD'
        }
      },
      willingToRelocate: {
        type: Boolean,
        default: false
      },
      availableFrom: Date
    },
    
    // Statistics
    stats: {
      appliedJobs: {
        type: Number,
        default: 0
      },
      savedJobs: {
        type: Number,
        default: 0
      },
      profileViews: {
        type: Number,
        default: 0
      }
    }
  },
 
  ratingsAverage: {
    type: Number,
    default: 0,
    min: [0, 'Rating must be above 0'],
    max: [5, 'Rating must be below 5'],
    set: val => Math.round(val * 10) / 10 // Rounds to 4.8
  },
  ratingsQuantity: {
    type: Number,
    default: 0
  },

  
  // In your User model schema
socialLogins: {
  google: {
    id: String,
    email: String,
    displayName: String,
    profileImage: String,
    lastLogin: Date,
    linkedAt: Date,
  },
     microsoft: {
    id: String,
    email: String,
    displayName: String,
    profileImage: String,
    lastLogin: Date,
    linkedAt: Date
  },
    github: {
      id: String,
      username: String,
      email: String,
      profileImage: String,
      lastLogin: Date,
      linkedAt: Date
    }
  },

  // Employer Specific Fields
  employerProfile: {
    // Company Information
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    },
    position: String,
    department: String,
    
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
    
    // Statistics
    stats: {
      jobsPosted: {
        type: Number,
        default: 0
      },
      activeJobs: {
        type: Number,
        default: 0
      },
      totalApplicants: {
        type: Number,
        default: 0
      },
      hiredCandidates: {
        type: Number,
        default: 0
      }
    }
  },

  // Universal Marketplace Statistics (ALL USERS can post products)
  marketplaceStats: {
    productsPosted: {
      type: Number,
      default: 0
    },
    activeProducts: {
      type: Number,
      default: 0
    },
    totalViews: {
      type: Number,
      default: 0
    },
    // Rating as seller
    sellerRating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      count: {
        type: Number,
        default: 0
      }
    }
  },



  // Authentication & Security
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  
  // FCM Token for push notifications
  fcmTokens: [{
    token: String,
    device: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedReason: String,
  blockedAt: Date,

  // Admin flag
  isAdmin: {
    type: Boolean,
    default: false
  },

  // Privacy Settings
  privacySettings: {
    profileVisibility: {
      type: String,
      enum: ['public', 'private', 'connections'],
      default: 'public'
    },
    showEmail: {
      type: Boolean,
      default: false
    },
    showPhone: {
      type: Boolean,
      default: false
    },
    biometricLogin: { type: Boolean, default: false } // Add this line
  },

  // Notification Preferences
  notificationPreferences: {
    email: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    jobAlerts: {
      type: Boolean,
      default: true
    },
    chatMessages: {
      type: Boolean,
      default: true
    },
    marketingEmails: {
      type: Boolean,
      default: false
    }
  },

  // Metadata
  lastLogin: Date,
  lastActive: Date,
  loginCount: {
    type: Number,
    default: 0
  },

  // Verification Badges (Phase 7)
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationBadges: [{
    type: { type: String, enum: ['identity', 'skill', 'education', 'employment'] },
    label: String,
    verifiedAt: Date
  }],

  // Legal Acceptance (Phase 12)
  legalAcceptance: {
    tosVersion: String,
    tosAcceptedAt: Date,
    privacyVersion: String,
    privacyAcceptedAt: Date
  },
  
  // Soft delete
  deletedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance

userSchema.index({ role: 1 });
userSchema.index({ 'profile.location.coordinates': '2dsphere' });
userSchema.index({ createdAt: -1 });
userSchema.index({ isActive: 1, isBlocked: 1 });


// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.profile.displayName || this.email.split('@')[0];
});

// Method to check if user can perform action based on role
userSchema.methods.can = function(action) {
  const permissions = {
    jobseeker: [
      'apply_job', 
      'save_job', 
      'upload_cv', 
      'post_product',      // Can post to marketplace
      'chat_with_seller',   // Can chat
      'delete_own_product'  // Can delete own products
    ],
    employer: [
      'post_job', 
      'view_applicants', 
      'manage_jobs', 
      'post_product',      // Can post to marketplace
      'chat_with_seller',   // Can chat
      'delete_own_product'  // Can delete own products
    ]
  };
  
  return permissions[this.role]?.includes(action) || false;
};



// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true, isBlocked: false, deletedAt: null });
};

// Static method to find registered users (jobseekers and employers only)
userSchema.statics.findRegistered = function() {
  return this.find({ 
    role: { $in: ['jobseeker', 'employer'] },
    isActive: true, 
    isBlocked: false, 
    deletedAt: null 
  });
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  // Set display name if not provided
  if (!this.profile.displayName && this.profile.firstName) {
    this.profile.displayName = this.fullName;
  }
  
  // Initialize marketplace stats for registered users
  if ((this.role === 'jobseeker' || this.role === 'employer') && !this.marketplaceStats) {
    this.marketplaceStats = {
      productsPosted: 0,
      activeProducts: 0,
      totalViews: 0,
      sellerRating: {
        average: 0,
        count: 0
      }
    };
  }
  
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;