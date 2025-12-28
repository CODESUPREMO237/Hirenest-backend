const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  updateProfilePicture,
  updateEmail,
  updatePhoneNumber,
  updatePassword,
  uploadCV,
  deleteCV,
  getUserById,
  updatePrivacySettings,
  updateNotificationPreferences,
  addFCMToken,
  removeFCMToken,
  deleteAccount,
  upgradeFromGuest,
  getActiveSessions
} = require('../controllers/user.controller');

const { 
  authenticate, 
  authorize,
  optionalAuthenticate 
} = require('../middleware/auth.middleware');

const { uploadImage, uploadFile } = require('../middleware/upload.middleware');

const {
  validate,
  updateProfileSchema,
  updateEmailSchema,
  updatePhoneSchema,
  updatePasswordSchema,
  addFCMTokenSchema,
  upgradeAccountSchema
} = require('../middleware/validation.middleware');

// ==================== PROFILE MANAGEMENT ====================

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current user profile
 * @access  Private (All authenticated users)
 */
router.get('/me', authenticate, getMyProfile);

/**
 * @route   PUT /api/v1/users/me
 * @desc    Update current user profile
 * @access  Private (All authenticated users)
 */
router.put('/me', authenticate, validate(updateProfileSchema), updateMyProfile);

// Session Management
// ==================== SESSIONS ====================

/**
 * @route   GET /api/v1/users/me/sessions
 * @desc    Get all active device sessions
 */

router.get('/me/sessions', authenticate, getActiveSessions);
/**
 * @route   DELETE /api/v1/users/me/sessions/:tokenId
 * @desc    Logout from a specific device
 */
router.delete('/me/sessions/:tokenId', authenticate, removeFCMToken);

/**
 * @route   PUT /api/v1/users/me/avatar
 * @desc    Update profile picture
 * @access  Private (All authenticated users)
 */
router.put('/me/avatar', authenticate, uploadImage.single('avatar'), updateProfilePicture);

/**
 * @route   PUT /api/v1/users/me/email
 * @desc    Update email address
 * @access  Private (All authenticated users)
 */
router.put('/me/email', authenticate, validate(updateEmailSchema), updateEmail);

/**
 * @route   PUT /api/v1/users/me/phone
 * @desc    Update phone number
 * @access  Private (All authenticated users)
 */
router.put('/me/phone', authenticate, validate(updatePhoneSchema), updatePhoneNumber);

/**
 * @route   PUT /api/v1/users/me/password
 * @desc    Update password
 * @access  Private (All authenticated users)
 */
router.put('/me/password', authenticate, validate(updatePasswordSchema), updatePassword);

// ==================== CV/RESUME MANAGEMENT ====================

/**
 * @route   POST /api/v1/users/me/cv
 * @desc    Upload CV/Resume
 * @access  Private (Job Seekers only)
 */
router.post(
  '/me/cv', 
  authenticate, 
  authorize('jobseeker'), 
  uploadFile.single('cv'), 
  uploadCV
);

/**
 * @route   DELETE /api/v1/users/me/cv
 * @desc    Delete CV/Resume
 * @access  Private (Job Seekers only)
 */
router.delete('/me/cv', authenticate, authorize('jobseeker'), deleteCV);

// ==================== SETTINGS ====================

/**
 * @route   PUT /api/v1/users/me/privacy
 * @desc    Update privacy settings
 * @access  Private (All authenticated users)
 */

// ==================== PRIVACY ====================
router.put('/me/privacy', authenticate, updatePrivacySettings);

/**
 * @route   PUT /api/v1/users/me/notifications
 * @desc    Update notification preferences
 * @access  Private (All authenticated users)
 */
router.put('/me/notifications', authenticate, updateNotificationPreferences);

// ==================== FCM TOKENS ====================

/**
 * @route   POST /api/v1/users/me/fcm-token
 * @desc    Add FCM token for push notifications
 * @access  Private (All authenticated users)
 */
router.post('/me/fcm-token', authenticate, validate(addFCMTokenSchema), addFCMToken);

/**
 * @route   DELETE /api/v1/users/me/fcm-token
 * @desc    Remove FCM token
 * @access  Private (All authenticated users)
 */
router.delete('/me/fcm-token', authenticate, validate(addFCMTokenSchema), removeFCMToken);

// ==================== ACCOUNT MANAGEMENT ====================

/**
 * @route   POST /api/v1/users/me/upgrade
 * @desc    Upgrade from guest to registered user
 * @access  Private (Guests only)
 */
router.post('/me/upgrade', authenticate, authorize('guest'), validate(upgradeAccountSchema), upgradeFromGuest);

/**
 * @route   DELETE /api/v1/users/me
 * @desc    Delete account (soft delete)
 * @access  Private (All authenticated users)
 */
router.delete('/me', authenticate, deleteAccount);

// ==================== PUBLIC ROUTES ====================

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user profile by ID (public)
 * @access  Public (respects privacy settings)
 */
router.get('/:id', optionalAuthenticate, getUserById);





/**
 * @route   PATCH /api/v1/users/me/privacy-settings
 * @desc    Update privacy settings
 * @access  Private
 */
router.patch(
  '/me/privacy-settings',
  authenticate,
  updatePrivacySettings // Use the controller function here!
);

/**
 * @route   DELETE /api/v1/users/me/notifications/:timestamp
 * @desc    Clear a specific notification
 */
router.delete('/me/notifications/:timestamp', authenticate, async (req, res) => {
  try {
    const { timestamp } = req.params;
    const dateToDelete = new Date(parseInt(timestamp));

    // If you store notifications in a sub-array in User model:
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { notifications: { createdAt: dateToDelete } }
    });

    res.status(200).json({ status: 'success', message: 'Notification cleared' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});



// lib/routes/user.routes.js

// Add this line above the module.exports
router.get('/:id/public-profile', optionalAuthenticate, getUserById);

module.exports = router;