const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// Note: Redis store can be added later for distributed rate limiting
// const RedisStore = require('rate-limit-redis');

/**
 * General API rate limiter
 * Limits requests per IP address
 */
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Strict rate limiter for sensitive endpoints
 * (login, registration, password reset)
 */
const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many attempts, please try again later.'
  },
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      status: 'error',
      message: 'Too many attempts. Please try again after 15 minutes.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * File upload rate limiter
 */
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    status: 'error',
    message: 'Too many file uploads, please try again later.'
  },
  handler: (req, res) => {
    logger.warn(`Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      status: 'error',
      message: 'Upload limit exceeded. Please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * API creation rate limiter
 * (for creating jobs, products, applications)
 */
const createRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 creations per hour
  message: {
    status: 'error',
    message: 'Too many items created, please try again later.'
  },
  skipSuccessfulRequests: false
});

/**
 * Guest rate limiter
 * More restrictive for guest users
 */
const guestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit guests to 30 requests per 15 minutes
  message: {
    status: 'error',
    message: 'Guest access limit reached. Please register for full access.'
  },
  handler: (req, res) => {
    logger.warn(`Guest rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      status: 'error',
      message: 'Guest access limit reached. Please register for unlimited access.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

module.exports = {
  rateLimiter,
  strictRateLimiter,
  uploadRateLimiter,
  createRateLimiter,
  guestRateLimiter
};