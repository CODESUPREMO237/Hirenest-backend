// ============================================================================
// jwt.utils.js
// src/utils/jwt.utils.js
// ============================================================================

const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

/**
 * Generate JWT access token
 */
const generateAccessToken = (userId, role, email) => {
  try {
    return jwt.sign(
      { 
        userId, 
        role,
        email,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '7d',
        issuer: 'jobconnect-api',
        audience: 'jobconnect-app'
      }
    );
  } catch (error) {
    logger.error('Error generating access token:', error);
    throw new Error('Token generation failed');
  }
};

/**
 * Generate JWT refresh token
 */
const generateRefreshToken = (userId) => {
  try {
    return jwt.sign(
      { 
        userId,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
        issuer: 'jobconnect-api',
        audience: 'jobconnect-app'
      }
    );
  } catch (error) {
    logger.error('Error generating refresh token:', error);
    throw new Error('Token generation failed');
  }
};

/**
 * Generate both access and refresh tokens
 */
const generateTokenPair = (userId, role, email) => {
  return {
    accessToken: generateAccessToken(userId, role, email),
    refreshToken: generateRefreshToken(userId),
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    tokenType: 'Bearer'
  };
};

/**
 * Verify JWT access token
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'jobconnect-api',
      audience: 'jobconnect-app'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw { code: 'TOKEN_EXPIRED', message: 'Token has expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      throw { code: 'INVALID_TOKEN', message: 'Invalid token' };
    }
    throw { code: 'TOKEN_ERROR', message: 'Token verification failed' };
  }
};

/**
 * Verify JWT refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(
      token, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      {
        issuer: 'jobconnect-api',
        audience: 'jobconnect-app'
      }
    );
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw { code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired' };
    }
    throw { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' };
  }
};

/**
 * Decode token without verification (for debugging)
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token, { complete: true });
  } catch (error) {
    return null;
  }
};

/**
 * Check if token is expired
 */
const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    
    return decoded.exp < Date.now() / 1000;
  } catch (error) {
    return true;
  }
};

/**
 * Get token expiry time
 */
const getTokenExpiry = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded?.exp ? new Date(decoded.exp * 1000) : null;
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  isTokenExpired,
  getTokenExpiry
};