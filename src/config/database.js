const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not defined in .env');

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000, // fail faster instead of hanging on DNS/network issues
      family: 4, // force IPv4 resolution, avoids intermittent ENOTFOUND on flaky IPv6
    });

    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = { connectDB };
