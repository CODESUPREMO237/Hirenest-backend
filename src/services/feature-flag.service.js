// ============================================================================
// FEATURE FLAG SERVICE
// src/services/feature-flag.service.js
// ============================================================================

const FeatureFlag = require('../models/FeatureFlag');
const logger = require('../config/logger');

// In-memory cache (refreshes every 5 minutes)
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all flags (cached)
 */
const getAllFlags = async () => {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  try {
    const flags = await FeatureFlag.find({});
    _cache = flags;
    _cacheTime = now;
    return flags;
  } catch (error) {
    logger.error('Error loading feature flags:', error);
    return _cache || []; // return stale cache on error
  }
};

/**
 * Check if a feature is enabled for a given user
 */
const isEnabled = async (flagKey, user = null) => {
  const flags = await getAllFlags();
  const flag = flags.find(f => f.key === flagKey);

  if (!flag || !flag.enabled) return false;

  // Check role targeting
  if (flag.targetRoles.length > 0 && user) {
    const userRole = user.isAdmin ? 'admin' : user.role;
    if (!flag.targetRoles.includes(userRole)) return false;
  }

  // Rollout percentage (deterministic based on user ID)
  if (flag.rolloutPercentage < 100 && user) {
    const hash = user._id.toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    if (hash % 100 >= flag.rolloutPercentage) return false;
  }

  return true;
};

/**
 * Get all flags resolved for a specific user (for client sync)
 */
const getFlagsForUser = async (user) => {
  const flags = await getAllFlags();
  const resolved = {};

  for (const flag of flags) {
    resolved[flag.key] = await isEnabled(flag.key, user);
  }

  return resolved;
};

/**
 * Invalidate cache (call after admin updates)
 */
const invalidateCache = () => {
  _cache = null;
  _cacheTime = 0;
};

module.exports = {
  getAllFlags,
  isEnabled,
  getFlagsForUser,
  invalidateCache
};
