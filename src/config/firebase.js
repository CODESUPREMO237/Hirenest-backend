// ============================================================================
// FIXED FIREBASE CONFIG
// src/config/firebase.js
// ============================================================================

const admin = require('firebase-admin');
const logger = require('./logger');

let firebaseInitialized = false;

const initializeFirebase = () => {
  try {
    if (firebaseInitialized) {
      console.log('Firebase already initialized');
      return;
    }

    // Check if Firebase env vars exist
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error('Firebase environment variables not found. Check your .env file.');
    }

    // Initialize Firebase Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
          .replace(/^"|"$/g, '')
          .replace(/\\n/g, '\n')
      })
    });

    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized successfully');
    logger.info('Firebase initialized', {
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    logger.error('Firebase initialization error:', error);
    throw error; // Throw error to prevent server from starting without Firebase
  }
};

/**
 * Verify Firebase ID Token
 */
const verifyIdToken = async (idToken) => {
  try {
    if (!firebaseInitialized) {
      throw new Error('Firebase not initialized');
    }
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
};

/**
 * Set custom user claims
 */
const setCustomUserClaims = async (uid, claims) => {
  try {
    if (!firebaseInitialized) {
      throw new Error('Firebase not initialized');
    }
    await admin.auth().setCustomUserClaims(uid, claims);
    logger.info(`Custom claims set for user ${uid}`);
  } catch (error) {
    logger.error('Failed to set custom claims:', error);
    throw error;
  }
};

/**
 * Generate password reset link
 */
const sendPasswordResetEmail = async (email) => {
  try {
    if (!firebaseInitialized) {
      throw new Error('Firebase not initialized');
    }
    const link = await admin.auth().generatePasswordResetLink(email);
    return link;
  } catch (error) {
    logger.error('Failed to generate password reset link:', error);
    throw error;
  }
};

/**
 * Generate email verification link
 */
const sendEmailVerification = async (email) => {
  try {
    if (!firebaseInitialized) {
      throw new Error('Firebase not initialized');
    }
    const link = await admin.auth().generateEmailVerificationLink(email);
    return link;
  } catch (error) {
    logger.error('Failed to generate email verification link:', error);
    throw error;
  }
};

/**
 * Get Firebase Admin instance
 */
const getFirebaseAdmin = () => {
  if (!firebaseInitialized) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return admin;
};

// ✅ CRITICAL: Export admin directly so controllers can use admin.auth()
module.exports = {
  initializeFirebase,
  admin, // ✅ This is the key export that was missing
  verifyIdToken,
  setCustomUserClaims,
  sendPasswordResetEmail,
  sendEmailVerification,
  getFirebaseAdmin
};

// ============================================================================
// VERIFICATION: Update your auth.controller.js imports
// src/controllers/auth.controller.js (top of file)
// ============================================================================

/*
Make sure the top of your auth.controller.js looks like this:

const User = require('../models/User');
const { 
  admin,                      // ✅ Import admin
  verifyIdToken, 
  setCustomUserClaims,
  sendPasswordResetEmail as sendPasswordResetLink,
  sendEmailVerification as sendEmailVerificationLink
} = require('../config/firebase');

const { 
  sendWelcomeEmail, 
  sendVerificationEmail 
} = require('../services/email.service');

const logger = require('../config/logger');

// Now you can use admin.auth() in your controller functions like:
// const firebaseUser = await admin.auth().createUser({ ... });
*/