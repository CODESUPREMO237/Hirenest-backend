const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    logger.error('Email transporter error:', error);
  } else {
    logger.info('Email server is ready to send messages');
  }
});

/**
 * Send email utility function
 */
const sendEmail = async (to, subject, html, text = '') => {
  try {
    const mailOptions = {
      from: `JobConnect <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Welcome email template
 */
const sendWelcomeEmail = async (email, name, role) => {
  const subject = 'Welcome to JobConnect!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to JobConnect!</h1>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>Thank you for joining JobConnect as a <strong>${role === 'jobseeker' ? 'Job Seeker' : 'Employer'}</strong>.</p>
          
          ${role === 'jobseeker' ? `
            <h3>What you can do:</h3>
            <ul>
              <li>✅ Search and apply for jobs</li>
              <li>✅ Upload your CV/Resume</li>
              <li>✅ Track your applications</li>
              <li>✅ Post products in the marketplace</li>
              <li>✅ Chat with sellers in real-time</li>
            </ul>
          ` : `
            <h3>What you can do:</h3>
            <ul>
              <li>✅ Post job listings</li>
              <li>✅ Manage applicants</li>
              <li>✅ Create your company profile</li>
              <li>✅ Post products in the marketplace</li>
              <li>✅ Chat with buyers in real-time</li>
            </ul>
          `}
          
          <p>Get started by completing your profile and exploring the platform.</p>
          
          <a href="${process.env.CLIENT_URL}/dashboard" class="button">Go to Dashboard</a>
          
          <p>If you have any questions, feel free to reach out to our support team.</p>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
          <p>This email was sent to ${email}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

/**
 * Email verification template
 */
const sendVerificationEmail = async (email, name, verificationLink) => {
  const subject = 'Verify Your Email Address';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📧 Verify Your Email</h1>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>Thank you for registering with JobConnect. Please verify your email address to activate your account.</p>
          
          <a href="${verificationLink}" class="button">Verify Email Address</a>
          
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationLink}</p>
          
          <p>This link will expire in 24 hours.</p>
          
          <p>If you didn't create an account, you can safely ignore this email.</p>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

/**
 * Password reset email
 */
const sendPasswordResetEmail = async (email, name, resetLink) => {
  const subject = 'Reset Your Password';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔒 Reset Your Password</h1>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          
          <a href="${resetLink}" class="button">Reset Password</a>
          
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong><br>
            This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account's security.
          </div>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

/**
 * Application received email (to job seeker)
 */
const sendApplicationReceivedEmail = async (email, name, jobTitle, companyName) => {
  const subject = `Application Received - ${jobTitle}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .job-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Application Received!</h1>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>Your application has been successfully submitted!</p>
          
          <div class="job-info">
            <h3>📋 Job Details:</h3>
            <p><strong>Position:</strong> ${jobTitle}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Status:</strong> Under Review</p>
          </div>
          
          <p>The employer will review your application and contact you if you're selected for the next steps.</p>
          
          <a href="${process.env.CLIENT_URL}/applications" class="button">View My Applications</a>
          
          <p>Good luck!</p>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

/**
 * New application notification (to employer)
 */
const sendNewApplicationNotification = async (email, employerName, applicantName, jobTitle) => {
  const subject = `New Application - ${jobTitle}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .applicant-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 New Application Received!</h1>
        </div>
        <div class="content">
          <h2>Hi ${employerName}!</h2>
          <p>You have received a new application for your job posting.</p>
          
          <div class="applicant-info">
            <h3>📝 Application Details:</h3>
            <p><strong>Applicant:</strong> ${applicantName}</p>
            <p><strong>Position:</strong> ${jobTitle}</p>
            <p><strong>Status:</strong> Pending Review</p>
          </div>
          
          <p>Review the application and candidate profile to proceed with the hiring process.</p>
          
          <a href="${process.env.CLIENT_URL}/employer/applicants" class="button">View Application</a>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

/**
 * Application status update email
 */
const sendApplicationStatusEmail = async (email, name, jobTitle, status) => {
  const statusMessages = {
    shortlisted: {
      emoji: '⭐',
      title: 'Congratulations! You\'ve Been Shortlisted',
      message: 'Great news! Your application has been shortlisted. The employer will contact you soon for the next steps.'
    },
    interviewing: {
      emoji: '📞',
      title: 'Interview Scheduled',
      message: 'You have been selected for an interview. Please check your application details for interview information.'
    },
    offered: {
      emoji: '🎉',
      title: 'Job Offer Received!',
      message: 'Congratulations! You have received a job offer. Please review the offer details in your application.'
    },
    rejected: {
      emoji: '📄',
      title: 'Application Update',
      message: 'Thank you for your interest. Unfortunately, we have decided to move forward with other candidates. We encourage you to apply for other positions.'
    }
  };

  const statusInfo = statusMessages[status] || statusMessages.rejected;
  const subject = `${statusInfo.emoji} ${statusInfo.title}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .status-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${statusInfo.emoji} ${statusInfo.title}</h1>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          
          <div class="status-box">
            <p><strong>Position:</strong> ${jobTitle}</p>
            <p><strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
          </div>
          
          <p>${statusInfo.message}</p>
          
          <a href="${process.env.CLIENT_URL}/applications" class="button">View Application</a>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

/**
 * New message notification email
 */
const sendNewMessageEmail = async (email, name, senderName, productName) => {
  const subject = `New message from ${senderName}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💬 New Message</h1>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>You have a new message from <strong>${senderName}</strong> regarding <strong>${productName}</strong>.</p>
          
          <a href="${process.env.CLIENT_URL}/chats" class="button">View Message</a>
          
          <p>Best regards,<br>The JobConnect Team</p>
        </div>
        <div class="footer">
          <p>© 2024 JobConnect. All rights reserved.</p>
          <p>To stop receiving these notifications, update your notification preferences in settings.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, subject, html);
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApplicationReceivedEmail,
  sendNewApplicationNotification,
  sendApplicationStatusEmail,
  sendNewMessageEmail
};