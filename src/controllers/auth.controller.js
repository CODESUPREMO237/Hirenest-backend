// ============================================================================
// auth.controller.js (COMPLETE PRODUCTION VERSION)
// Path: src/controllers/auth.controller.js
// ============================================================================

const User = require('../models/User');
const { 
  verifyIdToken, 
  admin,
  setCustomUserClaims
} = require('../config/firebase');
const { 
  generateTokenPair,
  verifyRefreshToken 
} = require('../utils/jwt.utils');
const { 
  sendWelcomeEmail, 
  sendVerificationEmail, 
  sendPasswordResetEmail,
  sendEmail 
} = require('../services/email.service');
const logger = require('../config/logger');
const axios = require('axios');

/**
 * Register new user (Manual Email/Password)
 */
const register = async (req, res) => {
  try {
    const { email, password, role, profile } = req.body;

    // Validate role
    if (!['jobseeker', 'employer'].includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid role. Must be jobseeker or employer'
      });
    }

    // 1. Create user in Firebase
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
      emailVerified: false
    });

    // 2. Set custom claims for role-based access
    await setCustomUserClaims(firebaseUser.uid, { role });

    // 3. Create user in MongoDB
    const user = await User.create({
      firebaseUid: firebaseUser.uid,
      email,
      role,
      profile: {
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        displayName: profile?.displayName || `${profile?.firstName} ${profile?.lastName}`,
        phone: profile?.phone,
        avatar: profile?.avatar
      },
      isEmailVerified: false,
      ...(role === 'jobseeker' && { jobSeekerProfile: {} }),
      ...(role === 'employer' && { employerProfile: {} }),
      marketplaceStats: {
        productsPosted: 0,
        activeProducts: 0,
        totalViews: 0,
        sellerRating: { average: 0, count: 0 }
      }
    });

    // 4. Generate backend tokens
    const tokens = generateTokenPair(user._id, user.role, user.email);
    
    // 5. Generate Firebase email link
    const verificationLink = await admin.auth().generateEmailVerificationLink(email);

    // 6. Background tasks (Email)
    setImmediate(async () => {
      try {
        await sendVerificationEmail(email, profile?.firstName || 'User', verificationLink);
        await sendWelcomeEmail(email, profile?.firstName || 'User', role);
        logger.info(`Registration emails sent to ${email}`);
      } catch (emailError) {
        logger.error('Background Email Error:', emailError);
      }
    });

    const firebaseCustomToken = await admin.auth().createCustomToken(firebaseUser.uid);

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please verify your email.',
      data: {
        user,
        tokens,
        firebaseToken: firebaseCustomToken,
        emailVerificationRequired: true
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ status: 'error', message: 'Email already registered' });
    }
    res.status(500).json({ status: 'error', message: 'Registration failed', error: error.message });
  }
};

/**
 * Login - Verify Firebase token and return backend JWT
 */
const login = async (req, res) => {
  try {
    const user = req.user; // Attached by your auth middleware
    user.lastLogin = new Date();
    user.loginCount += 1;
    await user.save({ validateBeforeSave: false });

    const tokens = generateTokenPair(user._id, user.role, user.email);
    const firebaseUser = await admin.auth().getUser(user.firebaseUid);

    // Optional Security Notification
    if (user.loginCount > 1) {
       try {
         await sendEmail(
           user.email,
           'New Login Detected',
           `<p>Hi ${user.profile.firstName}, we detected a new login to your account.</p>`,
           'New login detected on your account.'
         );
       } catch (e) { /* silent */ }
    }
// console.log(tokens);
    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user,
        tokens,
        firebaseUser: {
          emailVerified: firebaseUser.emailVerified,
          customClaims: firebaseUser.customClaims
        }
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ status: 'error', message: 'Login failed' });
  }
};

/**
 * Social auth for Google (Firebase token verification)
 */
/**
 * Social auth for Google (Firebase token verification)
 * ✅ NOW WITH AUTO-REGISTRATION
 */
const socialAuth = async (req, res) => {
  try {
    const { provider, idToken } = req.body;
    if (provider !== 'google') {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Use specific social endpoint for GitHub/Twitter' 
      });
    }

    // Verify Firebase token
    const decodedToken = await verifyIdToken(idToken);
    
    // Try to find existing user
    let user = await User.findOne({ firebaseUid: decodedToken.uid });
    let isNewUser = false;

    // ✅ AUTO-CREATE ACCOUNT if user doesn't exist
    if (!user) {
      logger.info(`Creating new account for Google user: ${decodedToken.email}`);

      // Get additional user info from Firebase token
      const displayName = decodedToken.name || decodedToken.email.split('@')[0];
      const firstName = decodedToken.given_name || displayName.split(' ')[0] || '';
      const lastName = decodedToken.family_name || displayName.split(' ').slice(1).join(' ') || '';

      // Create user in MongoDB (Firebase user already exists)
      user = await User.create({
        firebaseUid: decodedToken.uid,
        email: decodedToken.email,
        role: 'jobseeker', // Default role for social sign-ups
        profile: {
          firstName: firstName,
          lastName: lastName,
          displayName: displayName,
          avatar: decodedToken.picture || null,
        },
        isEmailVerified: decodedToken.email_verified || false,
        socialLogins: {
          google: {
            id: decodedToken.user_id || decodedToken.uid,
            email: decodedToken.email,
            displayName: displayName,
            profileImage: decodedToken.picture || null,
            lastLogin: new Date(),
            linkedAt: new Date(),
          }
        },
        jobSeekerProfile: {},
        marketplaceStats: {
          productsPosted: 0,
          activeProducts: 0,
          totalViews: 0,
          sellerRating: { average: 0, count: 0 }
        }
      });

      // Set custom claims for the new user
      await setCustomUserClaims(decodedToken.uid, { role: 'jobseeker' });

      isNewUser = true;
      logger.info(`New Google user created: ${user.email}`);

      // Send welcome email in background (optional)
      setImmediate(async () => {
        try {
          await sendWelcomeEmail(user.email, firstName || 'User', 'jobseeker');
          logger.info(`Welcome email sent to ${user.email}`);
        } catch (emailError) {
          logger.error('Welcome email error:', emailError);
        }
      });
    } else {
      // Update existing user login info
      user.lastLogin = new Date();
      user.loginCount = (user.loginCount || 0) + 1;
      
      // Update Google social login info
      if (!user.socialLogins) user.socialLogins = {};
      user.socialLogins.google = {
        id: decodedToken.user_id || decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name || user.profile.displayName,
        profileImage: decodedToken.picture || null,
        lastLogin: new Date(),
        linkedAt: user.socialLogins.google?.linkedAt || new Date(),
      };
      
      await user.save({ validateBeforeSave: false });
      logger.info(`Existing Google user logged in: ${user.email}`);
    }

    // Generate backend JWT tokens
    const tokens = generateTokenPair(user._id, user.role, user.email);
// console.log(tokens);
    // At the end of socialAuth function, change this:
res.status(200).json({
  status: 'success',
  message: isNewUser 
    ? 'Account created successfully with Google' 
    : 'Social authentication successful',
  data: { 
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      profile: user.profile,
      firebaseUid: user.firebaseUid,
      isEmailVerified: user.isEmailVerified,
      socialLogins: user.socialLogins,
      marketplaceStats: user.marketplaceStats,
      // ✅ Add these to avoid needing immediate profile fetch
      ...(user.role === 'jobseeker' && { jobSeekerProfile: user.jobSeekerProfile }),
      ...(user.role === 'employer' && { employerProfile: user.employerProfile }),
      privacySettings: user.privacySettings,
      notificationPreferences: user.notificationPreferences,
    }, 
    tokens, 
    isNewUser 
  }
});
  } catch (error) {
    logger.error('Social auth error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Social authentication failed',
      error: error.message 
    });
  }
};

/**
 * GitHub OAuth Exchange
 */
const githubExchange = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ status: 'error', message: 'Auth code required' });

    // 1. Exchange code for GitHub access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    }, { headers: { 'Accept': 'application/json' } });

    const githubAccessToken = tokenResponse.data.access_token;

    // 2. Get user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${githubAccessToken}` }
    });

    let email = userResponse.data.email;
    if (!email) {
      const emailResponse = await axios.get('https://api.github.com/user/emails', {
        headers: { 'Authorization': `Bearer ${githubAccessToken}` }
      });
      const primaryEmail = emailResponse.data.find(e => e.primary && e.verified);
      email = primaryEmail?.email || emailResponse.data[0]?.email;
    }

    // 3. Find user in MongoDB by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Account not found. Please register via email/password first.',
        code: 'USER_NOT_REGISTERED'
      });
    }

    user.lastLogin = new Date();
    user.loginCount += 1;
    await user.save({ validateBeforeSave: false });

    const tokens = generateTokenPair(user._id, user.role, user.email);
    const firebaseToken = await admin.auth().createCustomToken(user.firebaseUid);

    res.status(200).json({
      status: 'success',
      message: 'GitHub authentication successful',
      data: { user, tokens, firebaseToken, isNewUser: false }
    });
  } catch (error) {
    logger.error('GitHub exchange error:', error);
    res.status(500).json({ status: 'error', message: 'GitHub authentication failed' });
  }
};




/**
 * Microsoft OAuth 2.0 Exchange
 * 
 */

// ============================================================================
// FIXED: Microsoft OAuth Exchange with Auto-Registration
// Replace your microsoftExchange function in auth.controller.js
// ============================================================================

// ============================================================================
// BACKEND: Microsoft OAuth with PKCE (auth.controller.js)
// Replace your microsoftExchange function
// ============================================================================

const microsoftExchange = async (req, res) => {
  try {
    const { code, codeVerifier, redirectUri } = req.body;

    logger.info('Microsoft OAuth exchange initiated (PKCE flow)');

    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    // ✅ Step 1: Exchange code with PKCE (NO client_secret)
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier, // PKCE verifier instead of client_secret
        scope: 'openid profile email User.Read offline_access',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    logger.info('Microsoft token exchange successful');

    // Step 2: Get user info from Microsoft Graph API
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokenResponse.data.access_token}`
      }
    });

    const microsoftUser = userResponse.data;
    const microsoftId = microsoftUser.id;
    const email = microsoftUser.mail || microsoftUser.userPrincipalName;
    const displayName = microsoftUser.displayName;

    logger.info(`Microsoft OAuth: User identified - ${displayName} (${email})`);

    // Step 3: Find or create user
    let user = await User.findOne({
      $or: [
        { 'socialLogins.microsoft.id': microsoftId },
        { email: email }
      ]
    });

    let isNewUser = false;

    // Step 4: AUTO-CREATE ACCOUNT if user doesn't exist
    if (!user) {
      logger.info(`Creating new account for Microsoft user: ${displayName}`);

      // Create user in Firebase
      const firebaseUser = await admin.auth().createUser({
        email: email,
        emailVerified: true,
        displayName: displayName,
        photoURL: null,
      });

      await setCustomUserClaims(firebaseUser.uid, { role: 'jobseeker' });

      // Create user in MongoDB
      user = await User.create({
        firebaseUid: firebaseUser.uid,
        email: email,
        role: 'jobseeker',
        profile: {
          firstName: microsoftUser.givenName || displayName.split(' ')[0],
          lastName: microsoftUser.surname || displayName.split(' ').slice(1).join(' '),
          displayName: displayName,
          avatar: null,
        },
        isEmailVerified: true,
        socialLogins: {
          microsoft: {
            id: microsoftId,
            email: email,
            displayName: displayName,
            profileImage: null,
            lastLogin: new Date(),
            linkedAt: new Date(),
          }
        },
        jobSeekerProfile: {},
        marketplaceStats: {
          productsPosted: 0,
          activeProducts: 0,
          totalViews: 0,
          sellerRating: { average: 0, count: 0 }
        }
      });

      isNewUser = true;
      logger.info(`New Microsoft user created: ${user.email}`);
    } else {
      // Update existing user
      user.lastLogin = new Date();
      user.loginCount = (user.loginCount || 0) + 1;

      if (!user.socialLogins) user.socialLogins = {};
      user.socialLogins.microsoft = {
        id: microsoftId,
        email: email,
        displayName: displayName,
        profileImage: null,
        lastLogin: new Date(),
        linkedAt: user.socialLogins.microsoft?.linkedAt || new Date(),
      };

      await user.save({ validateBeforeSave: false });
      logger.info(`Existing Microsoft user logged in: ${user.email}`);
    }

    // Generate tokens
    const tokens = generateTokenPair(user._id, user.role, user.email);
    const firebaseToken = await admin.auth().createCustomToken(user.firebaseUid);

    res.status(200).json({
      status: 'success',
      message: isNewUser
        ? 'Microsoft account created successfully'
        : 'Microsoft authentication successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          firebaseUid: user.firebaseUid,
          socialLogins: user.socialLogins
        },
        tokens,
        firebaseToken,
        isNewUser
      }
    });

  } catch (error) {
    logger.error('Microsoft exchange error:', error.response?.data || error.message);

    if (error.response?.status === 400 || error.response?.status === 401) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Microsoft authorization code or PKCE verification failed',
        code: 'MICROSOFT_AUTH_FAILED',
        details: error.response?.data
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Microsoft authentication failed',
      code: 'MICROSOFT_SERVER_ERROR'
    });
  }
};


// ============================================================================
// ALSO UPDATE linkMicrosoftAccount function (for linking existing accounts)
// ============================================================================

const linkMicrosoftAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, redirectUri } = req.body;

    logger.info(`Linking Microsoft account for user: ${userId}`);

    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    // Exchange code for token
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid profile email User.Read',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    // Get user info
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokenResponse.data.access_token}`
      }
    });

    const microsoftUser = userResponse.data;

    // Check if already linked to another user
    const existingUser = await User.findOne({ 'socialLogins.microsoft.id': microsoftUser.id });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(400).json({
        status: 'error',
        message: 'This Microsoft account is already linked to another user',
        code: 'MICROSOFT_ALREADY_LINKED'
      });
    }

    // Link account
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'socialLogins.microsoft': {
            id: microsoftUser.id,
            email: microsoftUser.mail || microsoftUser.userPrincipalName,
            displayName: microsoftUser.displayName,
            profileImage: null,
            lastLogin: new Date(),
            linkedAt: new Date()
          }
        }
      },
      { new: true }
    );

    logger.info(`Microsoft account linked: ${microsoftUser.displayName} -> ${user.email}`);

    res.status(200).json({
      status: 'success',
      message: 'Microsoft account linked successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          socialLogins: user.socialLogins
        }
      }
    });

  } catch (error) {
    logger.error('Link Microsoft error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid Microsoft authorization code',
        code: 'MICROSOFT_AUTH_FAILED'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to link Microsoft account',
      code: 'LINK_MICROSOFT_FAILED'
    });
  }
};



/**
 * Refresh token
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return res.status(400).json({ status: 'error', message: 'Refresh token required' });

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(404).json({ status: 'error', message: 'User not found or deactivated' });
    }

    const tokens = generateTokenPair(user._id, user.role, user.email);
    res.status(200).json({ status: 'success', data: { tokens } });
  } catch (error) {
    res.status(401).json({ status: 'error', message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
  }
};

/**
 * Logout
 */
const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { lastActive: new Date() });
    res.status(200).json({ status: 'success', message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Logout failed' });
  }
};

/**
 * Email Verification endpoints
 */
const sendVerificationEmailEndpoint = async (req, res) => {
  try {
    if (req.user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
    const link = await admin.auth().generateEmailVerificationLink(req.user.email);
    await sendVerificationEmail(req.user.email, req.user.profile.firstName, link);
    res.status(200).json({ status: 'success', message: 'Verification email sent' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to send verification email' });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { uid } = req.body;
    await admin.auth().updateUser(uid, { emailVerified: true });
    await User.findOneAndUpdate({ firebaseUid: uid }, { isEmailVerified: true });
    res.status(200).json({ status: 'success', message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Verification failed' });
  }
};

/**
 * Password Reset
 */
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ status: 'success', message: 'If the account exists, a link has been sent' });

    const link = await admin.auth().generatePasswordResetLink(email);
    await sendPasswordResetEmail(email, user.profile.firstName, link);
    res.status(200).json({ status: 'success', message: 'Reset link sent' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to request password reset' });
  }
};

/**
 * Guest Session Management
 */
const createGuestSession = async (req, res) => {
  try {
    const firebaseUser = await admin.auth().createUser({ emailVerified: false });
    const guestUser = await User.create({
      firebaseUid: firebaseUser.uid,
      email: `guest_${firebaseUser.uid}@temp.jobconnect.com`,
      role: 'guest',
      profile: { displayName: 'Guest User' },
      guestLimits: {
        jobsViewed: { count: 0, lastReset: new Date() },
        productsViewed: { count: 0, lastReset: new Date() },
        searchesPerformed: { count: 0, lastReset: new Date() }
      }
    });

    const tokens = generateTokenPair(guestUser._id, 'guest', guestUser.email);
    const firebaseToken = await admin.auth().createCustomToken(firebaseUser.uid, { role: 'guest' });

    res.status(201).json({ status: 'success', data: { user: guestUser, tokens, firebaseToken } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to create guest session' });
  }
};

/**
 * Utility Checkers
 */
const checkEmailAvailability = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.query.email });
    res.status(200).json({ status: 'success', data: { available: !user } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to check email availability' });
  }
};

module.exports = {
  register, login, logout, refreshToken,
  sendVerificationEmailEndpoint, verifyEmail,
  requestPasswordReset, createGuestSession,
  checkEmailAvailability, socialAuth,
  githubExchange, microsoftExchange,  
  linkMicrosoftAccount
};