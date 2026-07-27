// ============================================================================
// auth.routes.js (UPDATED WITH GITHUB & TWITTER EXCHANGE)
// src/routes/auth.routes.js
// ============================================================================

const express = require('express');
const router = express.Router();

const {
  register,
  login,
  logout,
  refreshToken,
  sendVerificationEmailEndpoint,
  verifyEmail,
  requestPasswordReset,
  checkEmailAvailability,
  socialAuth,
  githubExchange,
microsoftExchange,
linkMicrosoftAccount
} = require('../controllers/auth.controller');

const { 
  authenticate,
  authenticateFirebase,
  optionalAuthenticate 
} = require('../middleware/auth.middleware');

const {
  validate,
  registerSchema,
  loginSchema,
  emailSchema,
  passwordResetSchema,
  socialAuthSchema,
  refreshTokenSchema,
  githubExchangeSchema,
  microsoftExchangeSchema
} = require('../middleware/validation.middleware');

// ==================== PUBLIC ROUTES ====================

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (jobseeker or employer)
 * @access  Public
 * @body    { email, password, role, profile: { firstName, lastName, phone } }
 */
router.post('/register', validate(registerSchema), register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login with Firebase token, get backend JWT
 * @access  Public
 * @headers Authorization: Bearer <firebase_token>
 */
router.post('/login', authenticateFirebase, login);

/**
 * @route   POST /api/v1/auth/social
 * @desc    Social authentication (Google only - uses Firebase token)
 * @access  Public
 * @body    { provider: 'google', idToken: '<firebase_token>' }
 */
router.post('/social', validate(socialAuthSchema), socialAuth);

/**
 * @route   POST /api/v1/auth/github/exchange
 * @desc    Exchange GitHub authorization code for access token
 * @access  Public
 * @body    { code: '<authorization_code>' }
 */
router.post('/github/exchange', validate(githubExchangeSchema), githubExchange);

/**
 * @route   POST /api/v1/auth/microsoft/exchange
 * @desc    Exchange Microsoft authorization code for access token
 * @access  Public
 * @body    { code: '<authorization_code>', redirectUri: '<callback_uri>' }
 */
router.post('/microsoft/exchange', validate(microsoftExchangeSchema), microsoftExchange);


router.post('/microsoft/link', authenticate, validate(microsoftExchangeSchema), linkMicrosoftAccount);


/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken: '<refresh_token>' }
 */
router.post('/refresh', validate(refreshTokenSchema), refreshToken);



/**
 * @route   POST /api/v1/auth/password-reset
 * @desc    Request password reset email
 * @access  Public
 * @body    { email: 'user@example.com' }
 */
router.post('/password-reset', validate(passwordResetSchema), requestPasswordReset);

/**
 * @route   GET /api/v1/auth/check-email
 * @desc    Check if email is available
 * @access  Public
 * @query   email=user@example.com
 */
router.get('/check-email', checkEmailAvailability);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email (callback endpoint from Firebase)
 * @access  Public
 * @body    { uid: '<firebase_uid>' }
 */
router.post('/verify-email', verifyEmail);

// ==================== PROTECTED ROUTES (Backend JWT) ====================

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user
 * @access  Private
 * @headers Authorization: Bearer <backend_jwt>
 */
router.post('/logout', authenticate, logout);

/**
 * @route   POST /api/v1/auth/send-verification
 * @desc    Send email verification link
 * @access  Private
 * @headers Authorization: Bearer <backend_jwt>
 */
router.post('/send-verification', authenticate, sendVerificationEmailEndpoint);



/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 * @headers Authorization: Bearer <backend_jwt>
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        _id: req.user._id,
        email: req.user.email,
        role: req.user.role,
        profile: req.user.profile,
        isEmailVerified: req.user.isEmailVerified,
        marketplaceStats: req.user.marketplaceStats,
        ...(req.user.role === 'jobseeker' && { jobSeekerProfile: req.user.jobSeekerProfile }),
        ...(req.user.role === 'employer' && { employerProfile: req.user.employerProfile })
      }
    }
  });
});



module.exports = router;