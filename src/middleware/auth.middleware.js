// ============================================================================
// auth.middleware.js (UPDATED)
// src/middleware/auth.middleware.js
// ============================================================================

const { verifyIdToken } = require('../config/firebase');
const { verifyAccessToken } = require('../utils/jwt.utils');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * Authenticate with Firebase token (for login/register)
 */
const authenticateFirebase = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided. Please authenticate.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify Firebase token
    const decodedToken = await verifyIdToken(token);
    
    // Find user in database
    const user = await User.findOne({ 
      firebaseUid: decodedToken.uid,
      isActive: true,
      isBlocked: false,
      deletedAt: null
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found or account deactivated'
      });
    }

    // Update last active
    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });

    // Attach user to request
    req.user = user;
    req.firebaseUser = decodedToken;

    next();
  } catch (error) {
    logger.error('Firebase authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Invalid token. Authentication failed.',
      code: 'INVALID_TOKEN'
    });
  }
};

/**
 * Authenticate with backend JWT (for protected routes)
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided. Please authenticate.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT token
    const decoded = verifyAccessToken(token);
    
    // Find user in database
    const user = await User.findById(decoded.userId).select('-__v');

    if (!user || !user.isActive || user.isBlocked || user.deletedAt) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found or account deactivated',
        code: 'USER_NOT_FOUND'
      });
    }

    // Update last active
    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });

    // Attach user to request
    req.user = user;
    req.token = decoded;

    next();
  } catch (error) {
    logger.error('JWT authentication error:', error);
    
    if (error.code === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired. Please refresh your token.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.code === 'INVALID_TOKEN') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Authentication failed.',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Optional authentication - allows both authenticated and unauthenticated users
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = verifyAccessToken(token);
      
      const user = await User.findById(decoded.userId).select('-__v');

      if (user && user.isActive && !user.isBlocked && !user.deletedAt) {
        user.lastActive = new Date();
        await user.save({ validateBeforeSave: false });
        req.user = user;
        req.token = decoded;
      } else {
        req.user = null;
      }
    } catch (error) {
      // Token invalid or expired, continue unauthenticated
      req.user = null;
    }

    next();
  } catch (error) {
    logger.warn('Optional auth failed, continuing unauthenticated:', error.message);
    req.user = null;
    next();
  }
};

/**
 * Check if user has specific role(s)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required role: ${roles.join(' or ')}`,
        userRole: req.user.role,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * Check if user can perform specific action
 */
const can = (action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!req.user.can(action)) {
      return res.status(403).json({
        status: 'error',
        message: `You don't have permission to ${action}`,
        userRole: req.user.role,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};



/**
 * Verify email is verified
 */
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      status: 'error',
      message: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
};

/**
 * Check if user owns the resource
 */
const isOwner = (resourceModel, resourceParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          status: 'error',
          message: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      const ownerId = resource.user || resource.postedBy || resource.seller || resource.createdBy;
      
      if (!ownerId || ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You do not own this resource.',
          code: 'NOT_OWNER'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error checking resource ownership',
        code: 'OWNERSHIP_CHECK_FAILED'
      });
    }
  };
};

/**
 * Admin only middleware
 */
const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

/**
 * Rate limit based on user role
 */
const roleBasedRateLimit = (limits) => {
  return (req, res, next) => {
    const userRole = req.user?.role || 'unauthenticated';
    const limit = limits[userRole] || limits.default;

    // Implement rate limiting logic here
    // This is a placeholder - use express-rate-limit or redis for production
    
    next();
  };
};

module.exports = {
  authenticate,
  authenticateFirebase,
  optionalAuthenticate,
  authorize,
  can,
  requireEmailVerification,
  isOwner,
  adminOnly,
  roleBasedRateLimit
};