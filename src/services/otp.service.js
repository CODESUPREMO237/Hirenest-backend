const bcrypt = require('bcryptjs');
const DeliveryOtp = require('../models/DeliveryOtp');
const logger = require('../config/logger');

/**
 * Generate a random 6-digit OTP
 */
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create an OTP for an order
 */
const createOtpForOrder = async (orderId, expirationDays = 7) => {
  try {
    const code = generateCode();
    
    // Hash the OTP like a password
    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(code, salt);

    // Set expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const otp = await DeliveryOtp.create({
      order: orderId,
      codeHash,
      expiresAt,
      status: 'active'
    });

    // Return the raw code ONLY ONCE so it can be sent to the buyer
    return { otpRecord: otp, rawCode: code };
  } catch (error) {
    logger.error('Error creating OTP:', error);
    throw error;
  }
};

/**
 * Regenerate OTP (because it is hashed and cannot be retrieved)
 */
const regenerateOtp = async (orderId, expirationDays = 7) => {
  try {
    const otp = await DeliveryOtp.findOne({ order: orderId });
    if (!otp) {
      throw new Error('No OTP found for this order to regenerate.');
    }
    
    if (otp.status === 'locked' || otp.status === 'verified') {
      throw new Error('Cannot regenerate OTP for an order that is locked or verified.');
    }

    const code = generateCode();
    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(code, salt);
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    otp.codeHash = codeHash;
    otp.expiresAt = expiresAt;
    otp.attempts = 0;
    otp.status = 'active';
    await otp.save();

    return { otpRecord: otp, rawCode: code };
  } catch (error) {
    logger.error('Error regenerating OTP:', error);
    throw error;
  }
};

/**
 * Verify an OTP submitted by the buyer
 */
const verifyOtp = async (orderId, submittedCode) => {
  try {
    const otp = await DeliveryOtp.findOne({ order: orderId });
    
    if (!otp) {
      return { success: false, reason: 'otp_not_found', message: 'No OTP found for this order.' };
    }

    if (otp.status === 'locked') {
      return { success: false, reason: 'locked', message: 'Maximum attempts reached. Order is disputed.' };
    }

    if (otp.status === 'verified') {
      return { success: false, reason: 'already_verified', message: 'OTP has already been verified.' };
    }

    if (new Date() > otp.expiresAt || otp.status === 'expired') {
      otp.status = 'expired';
      await otp.save();
      return { success: false, reason: 'expired', message: 'OTP has expired.' };
    }

    // Verify code
    const isMatch = await bcrypt.compare(submittedCode, otp.codeHash);

    if (isMatch) {
      otp.status = 'verified';
      otp.verifiedAt = new Date();
      otp.verifiedByChannel = 'app';
      await otp.save();
      return { success: true };
    } else {
      otp.attempts += 1;
      
      if (otp.attempts >= otp.maxAttempts) {
        otp.status = 'locked';
        await otp.save();
        return { success: false, reason: 'locked', message: 'Maximum attempts reached. Order locked for dispute.', attemptsLeft: 0 };
      }
      
      await otp.save();
      return { 
        success: false, 
        reason: 'invalid_code', 
        message: 'Invalid OTP code.', 
        attemptsLeft: otp.maxAttempts - otp.attempts 
      };
    }

  } catch (error) {
    logger.error('Error verifying OTP:', error);
    throw error;
  }
};

module.exports = {
  createOtpForOrder,
  regenerateOtp,
  verifyOtp
};
