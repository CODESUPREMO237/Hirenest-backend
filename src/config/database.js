const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not defined in .env');

    await mongoose.connect(mongoUri, {
      // options are optional in latest mongoose
      // useNewUrlParser: true,
      // useUnifiedTopology: true
    });

    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = { connectDB };
