const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  // Job Reference
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },

  // Applicant (Job Seeker)
  applicant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Application Status
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending',
    index: true
  },

  // Cover Letter
  coverLetter: {
    type: String,
    maxlength: 2000
  },

  // CV/Resume
 resume: {
    url: { type: String,     required: [true, 'A resume URL is required to apply']  },
    filename: String,
    publicId: String, // Added to match Flutter ResumeData model
    size: Number      // Added to match Flutter ResumeData model
  },

  // Answers to screening questions
  screeningAnswers: [{
    question: {
      type: String,
      required: true
    },
    answer: {
      type: String,
      required: true
    }
  }],

  // Additional Information
  additionalInfo: {
    portfolioUrl: String,
    linkedinUrl: String,
    githubUrl: String,
    websiteUrl: String,
    expectedSalary: {
      amount: Number,
      currency: String
    },
    availableFrom: Date,
    noticePeriod: String
  },

  // Timeline
  appliedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  reviewedAt: Date,
  shortlistedAt: Date,
  interviewedAt: Date,
  offeredAt: Date,
  acceptedAt: Date,
  rejectedAt: Date,
  withdrawnAt: Date,

  // Employer Notes (private)
  employerNotes: {
    type: String,
    maxlength: 1000
  },

  // Rating by employer
  employerRating: {
    type: Number,
    min: 1,
    max: 5
  },

  // Interview Details
  interviews: [{
    type: {
      type: String,
      enum: ['phone', 'video', 'in_person', 'technical', 'hr']
    },
    scheduledAt: Date,
    completedAt: Date,
    notes: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    }
  }],

  // Communication
  lastContactedAt: Date,
  
  // Rejection Details
  rejectionReason: String,
  rejectionFeedback: String,

  // Metadata
  source: {
    type: String,
    enum: ['direct', 'referral', 'external'],
    default: 'direct'
  },

  isViewed: {
    type: Boolean,
    default: false
  },

  viewedAt: Date

}, {
  timestamps: true
});

// Compound indexes
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true }); // One application per job per user
applicationSchema.index({ job: 1, status: 1 });
applicationSchema.index({ applicant: 1, status: 1 });
applicationSchema.index({ job: 1, createdAt: -1 });

// Method to update status
applicationSchema.methods.updateStatus = async function(newStatus) {
  this.status = newStatus;

  // Update timestamps
  const statusTimestamps = {
    reviewing: 'reviewedAt',
    shortlisted: 'shortlistedAt',
    interviewing: 'interviewedAt',
    offered: 'offeredAt',
    accepted: 'acceptedAt',
    rejected: 'rejectedAt',
    withdrawn: 'withdrawnAt'
  };

  const timestampField = statusTimestamps[newStatus];
  if (timestampField) {
    this[timestampField] = new Date();
  }

  return await this.save();
};

// Method to add interview
applicationSchema.methods.addInterview = async function(interviewData) {
  this.interviews.push(interviewData);
  if (this.status === 'shortlisted') {
    this.status = 'interviewing';
    this.interviewedAt = new Date();
  }
  return await this.save();
};

// Method to withdraw application
applicationSchema.methods.withdraw = async function() {
  this.status = 'withdrawn';
  this.withdrawnAt = new Date();
  return await this.save();
};

// Static method to check if user has already applied
applicationSchema.statics.hasApplied = async function(jobId, applicantId) {
  const count = await this.countDocuments({
    job: jobId,
    applicant: applicantId
  });
  return count > 0;
};

// Static method to get application stats for a job
applicationSchema.statics.getJobStats = async function(jobId) {
  const stats = await this.aggregate([
    { $match: { job: mongoose.Types.ObjectId(jobId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    total: 0,
    pending: 0,
    reviewing: 0,
    shortlisted: 0,
    interviewing: 0,
    offered: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0
  };

  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });

  return result;
};

// Update job stats when application is created
applicationSchema.post('save', async function(doc) {
  if (this.isNew) {
    const Job = mongoose.model('Job');
    await Job.findByIdAndUpdate(doc.job, {
      $inc: { 'stats.applications': 1 }
    });

    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.applicant, {
      $inc: { 'jobSeekerProfile.stats.appliedJobs': 1 }
    });
  }
});

const Application = mongoose.model('Application', applicationSchema);

module.exports = Application;