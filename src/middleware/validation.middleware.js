const Joi = require('joi');
const logger = require('../config/logger');

/**
 * Generic validation middleware
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors
      });
    }

    // Replace req.body with validated value
    req.body = value;
    next();
  };
};

// ==================== AUTH VALIDATION SCHEMAS ====================

const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters',
    'any.required': 'Password is required'
  }),
  role: Joi.string().valid('jobseeker', 'employer').required().messages({
    'any.only': 'Role must be either jobseeker or employer',
    'any.required': 'Role is required'
  }),
  profile: Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().min(2).max(50).required(),
    displayName: Joi.string().trim().min(2).max(100),
    phone: Joi.string().trim().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
  }).required()
});

/**
 * Login schema (not used with authenticateFirebase, but for documentation)
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

const emailSchema = Joi.object({
  email: Joi.string().email().required()
});

const passwordResetSchema = Joi.object({
  email: Joi.string().email().required()
});

/**
 * Social auth schema
 */
// Add these schemas to your validation.middleware.js file

/**
 * GitHub exchange schema
 */
const githubExchangeSchema = Joi.object({
  code: Joi.string()
    .required()
    .messages({
      'any.required': 'Authorization code is required'
    })
});

const microsoftExchangeSchema = Joi.object({
  code: Joi.string().required(),
  codeVerifier: Joi.string().required(), // Add code verifier validation
  redirectUri: Joi.string().uri().required()
});

// Update the socialAuthSchema to only accept 'google'
const socialAuthSchema = Joi.object({
  provider: Joi.string()
    .valid('google')
    .required()
    .messages({
      'any.only': 'Social auth endpoint only supports Google. Use /github/exchange or /twitter/exchange for other providers',
      'any.required': 'Provider is required'
    }),
  
  idToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Firebase ID token is required'
    })
});


 
 

/**
 * Refresh token schema
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});


// ==================== USER VALIDATION SCHEMAS ====================

const updateProfileSchema = Joi.object({
  profile: Joi.object({
    firstName: Joi.string().trim().min(2).max(50),
    lastName: Joi.string().trim().min(2).max(50),
    displayName: Joi.string().trim().min(2).max(100),
    phone: Joi.string().trim().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/),
    bio: Joi.string().max(500).allow(''),
    dateOfBirth: Joi.date().max('now'),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
    location: Joi.object({
      city: Joi.string().trim(),
      state: Joi.string().trim(),
      country: Joi.string().trim()
    }),
  }),
  
  jobSeekerProfile: Joi.object({
    skills: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        level: Joi.string().valid('beginner', 'intermediate', 'advanced', 'expert')
      })
    ),
    education: Joi.array().items(
      Joi.object({
        institution: Joi.string().required(),
        degree: Joi.string().required(),
        fieldOfStudy: Joi.string(),
        startDate: Joi.date(),
        endDate: Joi.date(),
        current: Joi.boolean(),
        description: Joi.string().max(500)
      })
    ),
    experience: Joi.array().items(
      Joi.object({
        company: Joi.string().required(),
        position: Joi.string().required(),
        startDate: Joi.date().required(),
        endDate: Joi.date(),
        current: Joi.boolean(),
        description: Joi.string().max(1000),
        location: Joi.string()
      })
    ),
    preferences: Joi.object({
      jobTypes: Joi.array().items(
        Joi.string().valid('full-time', 'part-time', 'contract', 'internship', 'freelance')
      ),
      expectedSalary: Joi.object({
        min: Joi.number().min(0),
        max: Joi.number().min(0),
        currency: Joi.string().length(3).uppercase()
      }),
      willingToRelocate: Joi.boolean(),
      availableFrom: Joi.date()
    })
  }),

  employerProfile: Joi.object({
    position: Joi.string().trim().max(100),
    department: Joi.string().trim().max(100)
  }),

  privacySettings: Joi.object({
    profileVisibility: Joi.string().valid('public', 'private', 'connections'),
    showEmail: Joi.boolean(),
    showPhone: Joi.boolean(),
    biometricLogin: Joi.boolean() // MOVED HERE to match Mongoose & Flutter
  }),

  notificationPreferences: Joi.object({
    email: Joi.boolean(),
    push: Joi.boolean(),
    sms: Joi.boolean(),
    jobAlerts: Joi.boolean(),
    chatMessages: Joi.boolean(),
    marketingEmails: Joi.boolean()
  })
}).min(1); // At least one field must be provided

const updateEmailSchema = Joi.object({
  newEmail: Joi.string().email().required()
});

const updatePhoneSchema = Joi.object({
  phone: Joi.string()
    .trim()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .required()
});

const updatePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(8).required(),
  newPassword: Joi.string().min(8).required()
});

const addFCMTokenSchema = Joi.object({
  token: Joi.string().required(),
  device: Joi.string().trim()
});

const upgradeAccountSchema = Joi.object({
  newRole: Joi.string().valid('jobseeker', 'employer').required()
});

// ==================== PRODUCT VALIDATION SCHEMAS ====================

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().min(10).max(5000).required(),
  category: Joi.string().trim().required(),
  subCategory: Joi.string().trim(),
  tags: Joi.array().items(Joi.string().trim().lowercase()),
  
  price: Joi.object({
    amount: Joi.number().min(0).required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
    negotiable: Joi.boolean().default(false)
  }).required(),

  condition: Joi.string().valid('new', 'like_new', 'good', 'fair', 'poor').default('new'),
  
  location: Joi.object({
    city: Joi.string().trim(),
    state: Joi.string().trim(),
    country: Joi.string().trim(),
    canShip: Joi.boolean().default(false),
    pickupAvailable: Joi.boolean().default(true)
  }),

  stock: Joi.object({
    available: Joi.boolean().default(true),
    quantity: Joi.number().min(0).default(1)
  }),

  contactPreferences: Joi.object({
    allowChat: Joi.boolean().default(true),
    showPhone: Joi.boolean().default(false),
    showEmail: Joi.boolean().default(false)
  })
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(3).max(200),
  description: Joi.string().trim().min(10).max(5000),
  category: Joi.string().trim(),
  subCategory: Joi.string().trim(),
  tags: Joi.array().items(Joi.string().trim().lowercase()),
  
  price: Joi.object({
    amount: Joi.number().min(0),
    currency: Joi.string().length(3).uppercase(),
    negotiable: Joi.boolean()
  }),

  condition: Joi.string().valid('new', 'like_new', 'good', 'fair', 'poor'),
  
  location: Joi.object({
    city: Joi.string().trim(),
    state: Joi.string().trim(),
    country: Joi.string().trim(),
    canShip: Joi.boolean(),
    pickupAvailable: Joi.boolean()
  }),

  stock: Joi.object({
    available: Joi.boolean(),
    quantity: Joi.number().min(0)
  }),

  status: Joi.string().valid('draft', 'active', 'sold', 'reserved', 'inactive'),

  contactPreferences: Joi.object({
    allowChat: Joi.boolean(),
    showPhone: Joi.boolean(),
    showEmail: Joi.boolean()
  })
}).min(1);

// ==================== JOB VALIDATION SCHEMAS ====================

const createJobSchema = Joi.object({
  title: Joi.string().trim().min(5).max(100).required(),
  description: Joi.string().trim().min(50).max(5000).required(),
  jobType: Joi.string().valid('full-time', 'part-time', 'contract', 'internship', 'freelance').required(),
  category: Joi.string().trim().required(),
  subCategory: Joi.string().trim(),
  experienceLevel: Joi.string().valid('entry', 'mid', 'senior', 'executive').required(),
  educationLevel: Joi.string().valid('high_school', 'bachelors', 'masters', 'phd', 'not_required'),
  
  location: Joi.object({
    type: Joi.string().valid('remote', 'onsite', 'hybrid').required(),
    address: Joi.object({
      city: Joi.string().trim(),
      state: Joi.string().trim(),
      country: Joi.string().trim(),
      zipCode: Joi.string().trim()
    }),
    remotePolicy: Joi.string().valid('fully_remote', 'partially_remote', 'no_remote')
  }).required(),

  salary: Joi.object({
    min: Joi.number().min(0),
    max: Joi.number().min(0),
    currency: Joi.string().length(3).uppercase().default('USD'),
    period: Joi.string().valid('hourly', 'monthly', 'yearly').default('yearly'),
    negotiable: Joi.boolean().default(true),
    showSalary: Joi.boolean().default(true)
  }),

  requirements: Joi.object({
    skills: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        required: Joi.boolean().default(true),
        level: Joi.string().valid('beginner', 'intermediate', 'advanced', 'expert')
      })
    ),
    languages: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        proficiency: Joi.string().valid('basic', 'conversational', 'fluent', 'native')
      })
    ),
    certifications: Joi.array().items(Joi.string()),
    yearsOfExperience: Joi.object({
      min: Joi.number().min(0).default(0),
      max: Joi.number().min(0)
    })
  }),

  benefits: Joi.array().items(Joi.string().trim()),
  applicationDeadline: Joi.date().greater('now'),
  applicationUrl: Joi.string().uri(),
  applicationEmail: Joi.string().email(),
  applicationInstructions: Joi.string().max(1000)
});

// ==================== CHAT VALIDATION SCHEMAS ====================

const sendMessageSchema = Joi.object({
  chatId: Joi.string().required(),
  content: Joi.string().trim().min(1).max(5000).required(),
  type: Joi.string().valid('text', 'image', 'file').default('text'),
  media: Joi.object({
    url: Joi.string().uri(),
    filename: Joi.string(),
    mimeType: Joi.string(),
    size: Joi.number()
  })
});

module.exports = {
  validate,
   // Auth validations
  registerSchema,
  loginSchema,
  emailSchema,
  passwordResetSchema,
  socialAuthSchema,
   githubExchangeSchema,       // ADD THIS
 microsoftExchangeSchema,  
  refreshTokenSchema,
  // User validations
  updateProfileSchema,
  updateEmailSchema,
  updatePhoneSchema,
  updatePasswordSchema,
  addFCMTokenSchema,
  upgradeAccountSchema,
  // Product validations
  createProductSchema,
  updateProductSchema,
  // Job validations
  createJobSchema,
  // Chat validations
  sendMessageSchema
};