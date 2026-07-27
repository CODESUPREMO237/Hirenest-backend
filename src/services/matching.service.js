// ============================================================================
// MATCHING SERVICE — Weighted Scoring V1
// src/services/matching.service.js
// ============================================================================

const Job = require('../models/Job');
const User = require('../models/User');
const logger = require('../config/logger');

// Weight configuration
const WEIGHTS = {
  skills: 0.40,
  location: 0.20,
  salary: 0.20,
  experience: 0.20
};

/**
 * Score how well a job matches a jobseeker profile
 */
const scoreJobForUser = (job, user) => {
  let score = 0;
  const profile = user.jobSeekerProfile || {};

  // 1. Skills match (40%)
  const userSkills = (profile.skills || []).map(s => s.name?.toLowerCase());
  const jobSkills = (job.requirements?.skills || job.skills || []).map(s =>
    typeof s === 'string' ? s.toLowerCase() : s.name?.toLowerCase()
  );

  if (userSkills.length > 0 && jobSkills.length > 0) {
    const matched = userSkills.filter(s => jobSkills.includes(s)).length;
    score += WEIGHTS.skills * (matched / Math.max(jobSkills.length, 1));
  }

  // 2. Location match (20%)
  const userCity = user.profile?.location?.city?.toLowerCase();
  const jobCity = (job.location?.city || job.location)?.toString()?.toLowerCase();
  if (userCity && jobCity && userCity === jobCity) {
    score += WEIGHTS.location;
  } else if (userCity && jobCity) {
    // Partial: same country
    const userCountry = user.profile?.location?.country?.toLowerCase();
    const jobCountry = job.location?.country?.toLowerCase();
    if (userCountry && jobCountry && userCountry === jobCountry) {
      score += WEIGHTS.location * 0.5;
    }
  }

  // 3. Salary match (20%)
  const expectedMin = profile.preferences?.expectedSalary?.min;
  const expectedMax = profile.preferences?.expectedSalary?.max;
  const jobMin = job.salary?.min || job.salaryRange?.min;
  const jobMax = job.salary?.max || job.salaryRange?.max;

  if (expectedMin && jobMax && jobMax >= expectedMin) {
    score += WEIGHTS.salary;
  } else if (expectedMax && jobMin && jobMin <= expectedMax) {
    score += WEIGHTS.salary * 0.7;
  }

  // 4. Experience level match (20%)
  const userExp = (profile.experience || []).length;
  const jobExpLevel = job.experienceLevel?.toLowerCase();

  if (jobExpLevel) {
    const expMap = { 'entry': 0, 'junior': 1, 'mid': 2, 'senior': 3, 'lead': 4, 'executive': 5 };
    const requiredLevel = expMap[jobExpLevel] || 0;
    const userLevel = Math.min(userExp, 5);
    const diff = Math.abs(userLevel - requiredLevel);
    score += WEIGHTS.experience * Math.max(0, 1 - diff * 0.25);
  }

  return Math.round(score * 100); // Return as percentage
};

/**
 * Get recommended jobs for a user
 */
const getRecommendedJobs = async (userId, limit = 20) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.role !== 'jobseeker') {
      return [];
    }

    // Fetch active jobs
    const jobs = await Job.find({
      status: 'active',
      deletedAt: null
    })
      .populate('postedBy', 'profile employerProfile')
      .limit(100) // cap for perf
      .sort({ isBoosted: -1, createdAt: -1 }); // boosted first

    // Score and rank
    const scored = jobs.map(job => ({
      job,
      matchScore: scoreJobForUser(job, user)
    }));

    // Sort by score descending, then return top N
    scored.sort((a, b) => b.matchScore - a.matchScore);

    return scored.slice(0, limit);
  } catch (error) {
    logger.error('Matching error:', error);
    return [];
  }
};

/**
 * Get recommended candidates for a job
 */
const getRecommendedCandidates = async (jobId, limit = 20) => {
  try {
    const job = await Job.findById(jobId);
    if (!job) return [];

    const candidates = await User.find({
      role: 'jobseeker',
      isActive: true,
      deletedAt: null
    }).limit(100);

    const scored = candidates.map(user => ({
      user: {
        _id: user._id,
        email: user.email,
        profile: user.profile,
        jobSeekerProfile: user.jobSeekerProfile,
        isVerified: user.isVerified,
        verificationBadges: user.verificationBadges
      },
      matchScore: scoreJobForUser(job, user)
    }));

    scored.sort((a, b) => b.matchScore - a.matchScore);
    return scored.slice(0, limit);
  } catch (error) {
    logger.error('Candidate matching error:', error);
    return [];
  }
};

module.exports = {
  scoreJobForUser,
  getRecommendedJobs,
  getRecommendedCandidates
};
