const logger = require('../config/logger');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Not Found Error Handler
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Error Handler
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?._id
  });

  // Default status code
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));

    return res.status(400).json(
      errorResponse('Validation failed', errors, 400)
    );
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json(
      errorResponse(`${field} already exists`, null, 400)
    );
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json(
      errorResponse('Invalid ID format', null, 400)
    );
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(
      errorResponse('Invalid token', null, 401)
    );
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(
      errorResponse('Token expired', null, 401)
    );
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json(
        errorResponse('File is too large. Maximum size is 5MB', null, 400)
      );
    }
    return res.status(400).json(
      errorResponse(err.message, null, 400)
    );
  }

  // Default error response
  res.status(statusCode).json(
    errorResponse(
      err.message || 'Internal Server Error',
      process.env.NODE_ENV === 'development' ? err.stack : null,
      statusCode
    )
  );
};

/**
 * Async Handler Wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  notFound,
  errorHandler,
  asyncHandler
};