const User = require('../models/User');
const Product = require('../models/Product');
const { admin } = require('../config/firebase');
const logger = require('../config/logger');

/**
 * Get current user profile
 */
const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-__v')
      .populate('employerProfile.company', 'name logo website');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Auto-heal marketplace stats if out of sync
    try {
      const activeProducts = await Product.countDocuments({ seller: user._id, status: 'active' });
      const totalProducts = await Product.countDocuments({ seller: user._id });
      
      let needsSave = false;
      if (!user.marketplaceStats) {
        user.marketplaceStats = { productsPosted: 0, activeProducts: 0, totalViews: 0, sellerRating: { average: 0, count: 0 } };
        needsSave = true;
      }
      
      if (user.marketplaceStats.activeProducts !== activeProducts || user.marketplaceStats.productsPosted !== totalProducts) {
        user.marketplaceStats.activeProducts = activeProducts;
        user.marketplaceStats.productsPosted = totalProducts;
        needsSave = true;
      }
      
      if (needsSave) {
        await user.save();
        logger.info(`Auto-healed marketplace stats for user ${user.email}`);
      }
    } catch (statsError) {
      logger.error('Error auto-healing marketplace stats:', statsError);
      // Continue anyway, don't fail the profile fetch
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching profile'
    });
  }
};

/**
 * Update user profile
 */
/**
 * Update user profile
 * Handles nested objects from Flutter and transforms them into Mongoose dotted-notation
 */
const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body;
    const updateObj = {};

    // 1. Handle Main Profile & Nested Location
    // 1. Handle Main Profile & Nested Location
if (updates.profile) {
  Object.keys(updates.profile).forEach((key) => {
    // Check if the current key is the 'location' object
    if (key === 'location' && typeof updates.profile.location === 'object') {
      
      // Inside THIS loop, we use locKey
      Object.keys(updates.profile.location).forEach((locKey) => {
        const val = updates.profile.location[locKey];
        // Allow empty strings so country shows up in Compass
        if (val !== null) { 
          updateObj[`profile.location.${locKey}`] = val;
        }
      });

    } else {
      // For firstName, lastName, phone, bio - we use 'key' NOT 'locKey'
      const val = updates.profile[key];
      if (val !== null) { // Removed val !== "" to allow clearing fields
        updateObj[`profile.${key}`] = val;
      }
    }
  });
}

    // 2. Handle Job Seeker Specific Nested Updates
    if (req.user.role === 'jobseeker' && updates.jobSeekerProfile) {
      const allowedJobSeekerFields = ['skills', 'education', 'experience', 'preferences'];
      allowedJobSeekerFields.forEach((field) => {
        if (updates.jobSeekerProfile[field] !== undefined) {
          updateObj[`jobSeekerProfile.${field}`] = updates.jobSeekerProfile[field];
        }
      });
    }

    // 3. Handle Employer Specific Nested Updates
    if (req.user.role === 'employer' && updates.employerProfile) {
      const allowedEmployerFields = ['position', 'department'];
      allowedEmployerFields.forEach((field) => {
        if (updates.employerProfile[field] !== undefined) {
          updateObj[`employerProfile.${field}`] = updates.employerProfile[field];
        }
      });
    }

    // 4. Handle Direct Settings (Privacy / Notifications)
    const directSettings = ['privacySettings', 'notificationPreferences'];
    directSettings.forEach((setting) => {
      if (updates[setting]) {
        Object.keys(updates[setting]).forEach((key) => {
          updateObj[`${setting}.${key}`] = updates[setting][key];
        });
      }
    });

    // Prevent empty updates
    if (Object.keys(updateObj).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid update fields provided'
      });
    }

    // 5. Execute Update
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateObj }, // Using $set with dots prevents overwriting the whole object
      { new: true, runValidators: true }
    ).select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: { user }
    });

  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating profile',
      error: error.message
    });
  }
};

/**
 * Update profile picture/avatar
 */
const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    const userId = req.user._id;
    
    // File is uploaded via multer middleware
    // req.file contains the uploaded file info
    const imageUrl = req.file.path; // Cloudinary URL or local path

    const user = await User.findByIdAndUpdate(
      userId,
      { 'profile.avatar': imageUrl },
      { new: true, runValidators: true }
    ).select('profile.avatar');

    res.status(200).json({
      status: 'success',
      message: 'Profile picture updated successfully',
      data: { 
        avatar: user.profile.avatar 
      }
    });
  } catch (error) {
    logger.error('Error updating profile picture:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating profile picture'
    });
  }
};

/**
 * Update email (requires Firebase update)
 */
const updateEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'New email is required'
      });
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already in use'
      });
    }

    // Update email in Firebase
    await admin.auth().updateUser(req.user.firebaseUid, {
      email: newEmail,
      emailVerified: false // Require re-verification
    });

    // Update email in database
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        email: newEmail,
        isEmailVerified: false
      },
      { new: true }
    ).select('email isEmailVerified');

    // Send verification email
    const verificationLink = await admin.auth().generateEmailVerificationLink(newEmail);

    res.status(200).json({
      status: 'success',
      message: 'Email updated successfully. Please verify your new email.',
      data: { 
        email: user.email,
        verificationRequired: true
      }
    });
  } catch (error) {
    logger.error('Error updating email:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({
        status: 'error',
        message: 'Email already in use'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Error updating email'
    });
  }
};

/**
 * Update phone number
 */
const updatePhoneNumber = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        'profile.phone': phone,
        isPhoneVerified: false // Require re-verification
      },
      { new: true }
    ).select('profile.phone isPhoneVerified');

    res.status(200).json({
      status: 'success',
      message: 'Phone number updated successfully',
      data: { 
        phone: user.profile.phone,
        verificationRequired: true
      }
    });
  } catch (error) {
    logger.error('Error updating phone number:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating phone number'
    });
  }
};

/**
 * Update password (via Firebase)
 */
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Current and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long'
      });
    }

    // Note: Password verification should be done on client side with Firebase
    // This endpoint updates the password in Firebase
    await admin.auth().updateUser(req.user.firebaseUid, {
      password: newPassword
    });

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully'
    });
  } catch (error) {
    logger.error('Error updating password:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating password'
    });
  }
};

/**
 * Upload CV/Resume (Job Seeker only)
 */
const uploadCV = async (req, res) => {
  try {
    if (req.user.role !== 'jobseeker') {
      return res.status(403).json({
        status: 'error',
        message: 'Only job seekers can upload CV'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No CV file provided'
      });
    }

    const cvUrl = req.file.path;
    const filename = req.file.originalname;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        'jobSeekerProfile.resume': {
          url: cvUrl,
          filename: filename,
          uploadedAt: new Date()
        }
      },
      { new: true }
    ).select('jobSeekerProfile.resume');

    res.status(200).json({
      status: 'success',
      message: 'CV uploaded successfully',
      data: { 
        resume: user.jobSeekerProfile.resume 
      }
    });
  } catch (error) {
    logger.error('Error uploading CV:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error uploading CV'
    });
  }
};

/**
 * Delete CV/Resume
 */
const deleteCV = async (req, res) => {
  try {
    if (req.user.role !== 'jobseeker') {
      return res.status(403).json({
        status: 'error',
        message: 'Only job seekers can delete CV'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $unset: { 'jobSeekerProfile.resume': '' }
      },
      { new: true }
    );

    // TODO: Delete file from storage (Cloudinary or local)

    res.status(200).json({
      status: 'success',
      message: 'CV deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting CV:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting CV'
    });
  }
};

/**
 * Get user by ID (public profile)
 */
// src/controllers/user.controller.js

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      _id: id,
      isActive: true,
      isBlocked: false,
      deletedAt: null
    })
    // Ensure we select marketplaceStats so the Flutter model gets rating/reviews
    .select('profile role marketplaceStats jobSeekerProfile createdAt privacySettings')
    .populate('employerProfile.company', 'name logo website');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Handle Private Profiles
    if (user.privacySettings && user.privacySettings.profileVisibility === 'private') {
      return res.status(200).json({
        status: 'success',
        data: {
          user: {
            _id: user._id,
            profile: {
               firstName: user.profile.firstName,
               avatar: user.profile.avatar,
            },
            role: user.role,
            marketplaceStats: user.marketplaceStats // Usually okay to show ratings even if private
          }
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user'
    });
  }
};

/**
 * Update privacy settings
 */
/**
 * Update privacy settings
 */
const updatePrivacySettings = async (req, res) => {
  try {
    // FIX: Look inside req.body.privacySettings because Flutter nests the data
    const settings = req.body.privacySettings || {};
    
    const { 
      profileVisibility, 
      showEmail, 
      showPhone, 
      biometricLogin 
    } = settings;

    const updateObj = {};
    
    if (profileVisibility) {
      updateObj['privacySettings.profileVisibility'] = profileVisibility;
    }
    if (showEmail !== undefined) {
      updateObj['privacySettings.showEmail'] = showEmail;
    }
    if (showPhone !== undefined) {
      updateObj['privacySettings.showPhone'] = showPhone;
    }
    // This will now work because biometricLogin is correctly pulled from 'settings'
    if (biometricLogin !== undefined) {
      updateObj['privacySettings.biometricLogin'] = biometricLogin;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateObj },
      { new: true }
    ).select('privacySettings');

    res.status(200).json({
      status: 'success',
      message: 'Privacy settings updated',
      data: { privacySettings: user.privacySettings }
    });
  } catch (error) {
    logger.error('Error updating privacy settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating privacy settings'
    });
  }
};

/**
 * Update notification preferences
 */
const updateNotificationPreferences = async (req, res) => {
  try {
    const preferences = req.body;

    const updateObj = {};
    Object.keys(preferences).forEach(key => {
      updateObj[`notificationPreferences.${key}`] = preferences[key];
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateObj },
      { new: true }
    ).select('notificationPreferences');

    res.status(200).json({
      status: 'success',
      message: 'Notification preferences updated',
      data: { notificationPreferences: user.notificationPreferences }
    });
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating notification preferences'
    });
  }
};

/**
 * Add FCM token for push notifications
 */
const addFCMToken = async (req, res) => {
  try {
    const { token, device } = req.body;
    if (!token) return res.status(400).json({ status: 'error', message: 'FCM token is required' });

    // Use $addToSet to ensure the token is unique within the array
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { 
        fcmTokens: { 
          token, 
          device: device || 'unknown', 
          addedAt: new Date() 
        } 
      }
    });

    res.status(200).json({ status: 'success', message: 'FCM token added successfully' });
  } catch (error) {
    logger.error('Error adding FCM token:', error);
    res.status(500).json({ status: 'error', message: 'Error adding FCM token' });
  }
};


/**
 * Remove FCM token / Logout specific session
 */
const removeFCMToken = async (req, res) => {
  try {
    // Check params first (for logout button), then check body (for manual token removal)
    const idToRemove = req.params.tokenId || req.body.tokenId;

    if (!idToRemove) {
      return res.status(400).json({ status: 'error', message: 'Token ID is required' });
    }

    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { fcmTokens: { _id: idToRemove } } }
    );

    res.status(200).json({ status: 'success', message: 'Session removed successfully' });
  } catch (error) {
    logger.error('Error removing session:', error);
    res.status(500).json({ status: 'error', message: 'Error removing session' });
  }
};
/**
 * Get all active sessions (FCM tokens)
 */
const getActiveSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('fcmTokens');
    res.status(200).json({
      status: 'success',
      data: user.fcmTokens || []
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error fetching sessions' });
  }
};

/**
 * Delete account
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const firebaseUid = req.user.firebaseUid;

    // Soft delete in database
    await User.findByIdAndUpdate(userId, {
      deletedAt: new Date(),
      isActive: false
    });

    // Delete from Firebase
    await admin.auth().deleteUser(firebaseUid);

    res.status(200).json({
      status: 'success',
      message: 'Account deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting account:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting account'
    });
  }
};


// src/controllers/user.controller.js
const searchUsers = async (req, res) => {
  try {
    const { email } = req.query;
    const users = await User.find({
      email: { $regex: email, $options: 'i' }
    }).select('fullName email profile');

    res.status(200).json({
      status: 'success',
      data: users
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const getTalent = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch users with role 'jobseeker'
    // Optional: filter out users who haven't completed their profile at all
    const users = await User.find({ role: 'jobseeker' })
      .select('-__v -password -firebaseUid')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments({ role: 'jobseeker' });

    res.status(200).json({
      status: 'success',
      data: users,
      meta: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching talent:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
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
  getActiveSessions,
  searchUsers,
  getTalent
};