// ==================== API RESPONSE UTILITY ====================
// src/utils/apiResponse.js

/**
 * Success response wrapper
 */
const successResponse = (message, data = null, statusCode = 200) => {
  return {
    status: 'success',
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

/**
 * Error response wrapper
 */
const errorResponse = (message, errors = null, statusCode = 500) => {
  return {
    status: 'error',
    statusCode,
    message,
    ...(errors && { errors }),
    timestamp: new Date().toISOString()
  };
};

/**
 * Paginated response wrapper
 */
const paginatedResponse = (data, page, limit, total, message = 'Data retrieved successfully') => {
  return {
    status: 'success',
    message,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse
};