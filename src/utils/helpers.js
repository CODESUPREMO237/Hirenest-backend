// ==================== CONSTANTS ====================
// src/utils/constants.js

// User Roles
const USER_ROLES = {
  JOBSEEKER: 'jobseeker',
  EMPLOYER: 'employer',
  ADMIN: 'admin'
};

// Job Types
const JOB_TYPES = {
  FULL_TIME: 'full-time',
  PART_TIME: 'part-time',
  CONTRACT: 'contract',
  INTERNSHIP: 'internship',
  FREELANCE: 'freelance'
};

// Job Status
const JOB_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  FILLED: 'filled'
};

// Experience Levels
const EXPERIENCE_LEVELS = {
  ENTRY: 'entry',
  MID: 'mid',
  SENIOR: 'senior',
  EXECUTIVE: 'executive'
};

// Application Status
const APPLICATION_STATUS = {
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  SHORTLISTED: 'shortlisted',
  INTERVIEWING: 'interviewing',
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn'
};

// Product Status
const PRODUCT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  SOLD: 'sold',
  RESERVED: 'reserved',
  INACTIVE: 'inactive'
};

// Product Condition
const PRODUCT_CONDITION = {
  NEW: 'new',
  LIKE_NEW: 'like_new',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor'
};

// Order Status
const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PAYMENT_PROCESSING: 'payment_processing',
  PAID: 'paid',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  DISPUTED: 'disputed'
};

// Payment Methods (MeSomb)
// Payment Methods (MeSomb)
// Updated to include the short strings your Flutter app is sending
const PAYMENT_METHODS = {
  MESOMB_MTN: 'mesomb_mtn',
  MESOMB_ORANGE: 'mesomb_orange',
  MTN: 'mtn',
  ORANGE: 'orange'
};

// Payment Status
// MeSomb returns UPPERCASE. Keeping these uppercase ensures 
// the service logic "if (status === 'SUCCESS')" works perfectly.
const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
};

// Chat Status
const CHAT_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  BLOCKED: 'blocked'
};

// Message Types
const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  SYSTEM: 'system'
};



// File Upload Limits
const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_IMAGES: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

// Pagination Defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};



// MeSomb Currency
const MESOMB_CURRENCY = 'XAF';

// Email Templates
const EMAIL_SUBJECTS = {
  WELCOME: 'Welcome to JobConnect!',
  VERIFICATION: 'Verify Your Email Address',
  PASSWORD_RESET: 'Reset Your Password',
  APPLICATION_RECEIVED: 'Application Received',
  APPLICATION_STATUS: 'Application Status Update',
  NEW_MESSAGE: 'New Message',
  ORDER_CONFIRMATION: 'Order Confirmation',
  PAYMENT_SUCCESS: 'Payment Successful'
};

// Socket.IO Events
const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connection',
  DISCONNECT: 'disconnect',
  
  // User
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  
  // Chat
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_START: 'chat:start',
  
  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELETED: 'message:deleted',
  
  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_USER: 'typing:user',
  
  // Notifications
  NOTIFICATION_NEW: 'notification:new'
};
/**
 * Formats phone number to standard 237XXXXXXXXX format for MeSomb
 * Handles: 679398551, +237679398551, 237679398551
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  
  // 1. Remove all non-numeric characters (spaces, +, dashes)
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // 2. If it's a standard 9-digit Cameroon number, add 237
  if (cleaned.length === 9) {
    return `237${cleaned}`;
  }
  
  // 3. If it already starts with 237 and has 12 digits, return it
  if (cleaned.length === 12 && cleaned.startsWith('237')) {
    return cleaned;
  }
  
  return cleaned;
};

/**
 * Calculates platform commission based on the constant rate
 */
// Commission Rate
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.05;

const calculateCommission = (amount) => {
  const rate = COMMISSION_RATE || 0.05; // Fallback to 5%
  const commission = Math.round(amount * rate);
  const sellerAmount = amount - commission;
  
  return {
    commission,
    sellerAmount
  };
};



module.exports = {
  USER_ROLES,
  JOB_TYPES,
  JOB_STATUS,
  EXPERIENCE_LEVELS,
  APPLICATION_STATUS,
  PRODUCT_STATUS,
  PRODUCT_CONDITION,
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  CHAT_STATUS,
  MESSAGE_TYPES,
  UPLOAD_LIMITS,
  PAGINATION,
  COMMISSION_RATE,
  MESOMB_CURRENCY,
  EMAIL_SUBJECTS,
  SOCKET_EVENTS,
  formatPhoneNumber,
  calculateCommission
};