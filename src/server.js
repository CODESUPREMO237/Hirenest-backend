console.log('🔥 SERVER FILE EXECUTED');

// Step-by-step execution tracking
try {
  console.log('Step 1: Loading dotenv...');
  require('dotenv').config();
  console.log('✅ Step 1: dotenv loaded');
  console.log('ENV CHECK:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    MONGO_URI: process.env.MONGO_URI ? '✓ Found' : '✗ Missing'
  });
} catch (error) {
  console.error('❌ Failed at Step 1 (dotenv):', error.message);
  process.exit(1);
}

try {
  console.log('Step 2: Loading core modules...');
  const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');
  const helmet = require('helmet');
  const morgan = require('morgan');
  const compression = require('compression');
  const http = require('http');
  const { Server } = require('socket.io');
  console.log('✅ Step 2: Core modules loaded');
} catch (error) {
  console.error('❌ Failed at Step 2 (core modules):', error.message);
  process.exit(1);
}

try {
  console.log('Step 3: Loading configurations...');
  const { connectDB } = require('./config/database');
  const { initializeFirebase } = require('./config/firebase');
  const logger = require('./config/logger');
  console.log('✅ Step 3: Configurations loaded');
} catch (error) {
  console.error('❌ Failed at Step 3 (configs):', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

try {
  console.log('Step 4: Loading routes...');
  const authRoutes = require('./routes/auth.routes');
  console.log('  ✓ auth routes');
  const userRoutes = require('./routes/user.routes');
  console.log('  ✓ user routes');
  const jobRoutes = require('./routes/job.routes');
  console.log('  ✓ job routes');
  const marketplaceRoutes = require('./routes/marketplace.routes');
  console.log('  ✓ marketplace routes');
  const applicationRoutes = require('./routes/application.routes');
  console.log('  ✓ application routes');
  const chatRoutes = require('./routes/chat.routes');
  console.log('  ✓ chat routes');
  const companyRoutes = require('./routes/company.routes');
  console.log('  ✓ company routes');
  const adminRoutes = require('./routes/admin.routes');
  console.log('  ✓ admin routes');
  const analyticsRoutes = require('./routes/analytics.routes');
  console.log('  ✓ analytics routes');
  const paymentRoutes = require('./routes/payment.routes');
  console.log('  ✓ payment routes');
  const reviewRoutes = require('./routes/reviewRoutes'); 
  console.log('  ✓ review routes');
  const notificationRoutes = require('./routes/notification.routes');
  console.log('  ✓ notification routes ');
  console.log('✅ Step 4: All routes loaded');
} catch (error) {
  console.error('❌ Failed at Step 4 (routes):', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

try {
  console.log('Step 5: Loading middleware...');
  const { errorHandler } = require('./middleware/error.middleware');
  const { rateLimiter } = require('./middleware/rateLimiter.middleware');
  console.log('✅ Step 5: Middleware loaded');
} catch (error) {
  console.error('❌ Failed at Step 5 (middleware):', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

try {
  console.log('Step 6: Loading socket handlers...');
  const { initializeSocketHandlers } = require('./socket/socket.handlers');
  console.log('✅ Step 6: Socket handlers loaded');
} catch (error) {
  console.error('❌ Failed at Step 6 (socket handlers):', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

console.log('Step 7: Initializing Express app...');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB } = require('./config/database');
const { initializeFirebase } = require('./config/firebase');
const logger = require('./config/logger');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const jobRoutes = require('./routes/job.routes');
const marketplaceRoutes = require('./routes/marketplace.routes');
const applicationRoutes = require('./routes/application.routes');
const chatRoutes = require('./routes/chat.routes');
const companyRoutes = require('./routes/company.routes');
const adminRoutes = require('./routes/admin.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const paymentRoutes = require('./routes/payment.routes');
const reviewRoutes = require('./routes/reviewRoutes'); 
const { errorHandler } = require('./middleware/error.middleware');
const { rateLimiter } = require('./middleware/rateLimiter.middleware');
const { initializeSocketHandlers } = require('./socket/socket.handlers');
const notificationRoutes = require('./routes/notification.routes');


const app = express();
const server = http.createServer(app);
console.log('✅ Step 7: Express app initialized');

console.log('Step 8: Setting up Socket.IO...');
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});
app.set('io', io);
console.log('✅ Step 8: Socket.IO configured');

console.log('Step 9: Configuring middleware...');
try {
  app.use(helmet());
  console.log('  ✓ helmet');
  
  // ✅ FIXED CORS - Accept all origins in development
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        console.log('  → Request without origin header (mobile app)');
        return callback(null, true);
      }
      
      console.log('  → Request from origin:', origin);
      
      // In development, allow ALL origins
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // In production, check against allowed origins
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
  };
  
  app.use(cors(corsOptions));
  console.log('  ✓ cors (accepting all origins in development)');
  
  // Handle preflight requests
  app.options('*', cors(corsOptions));
  console.log('  ✓ preflight handler');
  
  app.use(compression());
  console.log('  ✓ compression');
  
  // ✅ Increased payload limits for file uploads
  app.use(express.json({ limit: '50mb' }));
  console.log('  ✓ json parser (50mb limit)');
  
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  console.log('  ✓ urlencoded parser (50mb limit)');
  
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));
  console.log('  ✓ morgan');
  
  app.use('/api/', rateLimiter);
  console.log('  ✓ rate limiter');
  
  app.use('/uploads', express.static('uploads'));
  console.log('  ✓ static files');
  
  // ✅ Request debugging middleware
  app.use((req, res, next) => {
    console.log(`\n📨 ${req.method} ${req.url}`);
    console.log(`   Origin: ${req.headers.origin || 'no-origin'}`);
    console.log(`   Content-Type: ${req.headers['content-type'] || 'not-set'}`);
    console.log(`   User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'not-set'}...`);
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const bodyString = JSON.stringify(req.body);
      console.log(`   Body size: ${bodyString.length} bytes`);
      console.log(`   Body preview: ${bodyString.substring(0, 100)}${bodyString.length > 100 ? '...' : ''}`);
    }
    next();
  });
  console.log('  ✓ debug logging');
  
  console.log('✅ Step 9: Middleware configured');
} catch (error) {
  console.error('❌ Failed at Step 9:', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

console.log('Step 10: Setting up routes...');
try {
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'JobConnect Marketplace API is running',
      environment: process.env.NODE_ENV || 'development',
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  });
  console.log('  ✓ health check');

  // ✅ Test endpoints for mobile app connectivity
  app.get('/api/v1/test', (req, res) => {
    console.log('✅ GET /api/v1/test endpoint hit');
    console.log('   Origin:', req.headers.origin || 'no-origin');
    console.log('   User-Agent:', req.headers['user-agent']);
    
    res.status(200).json({
      success: true,
      message: 'Backend is reachable! 🎉',
      timestamp: new Date().toISOString(),
      clientIP: req.ip,
      method: 'GET',
      headers: {
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']
      }
    });
  });

  app.post('/api/v1/test', (req, res) => {
    console.log('✅ POST /api/v1/test endpoint hit');
    console.log('   Origin:', req.headers.origin || 'no-origin');
    console.log('   Content-Type:', req.headers['content-type']);
    console.log('   Body received:', req.body);
    
    res.status(200).json({
      success: true,
      message: 'POST received successfully! 🎉',
      receivedData: req.body,
      timestamp: new Date().toISOString(),
      clientIP: req.ip
    });
  });
  console.log('  ✓ test endpoints');

  const API_VERSION = process.env.API_VERSION || 'v1';
  
  console.log('  → Registering auth routes...');
  console.log('    authRoutes type:', typeof authRoutes, authRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/auth`, authRoutes);
  console.log('  ✓ auth routes registered');
  
  console.log('  → Registering user routes...');
  console.log('    userRoutes type:', typeof userRoutes, userRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/users`, userRoutes);
  console.log('  ✓ user routes registered');
  
  console.log('  → Registering job routes...');
  console.log('    jobRoutes type:', typeof jobRoutes, jobRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/jobs`, jobRoutes);
  console.log('  ✓ job routes registered');
  
  console.log('  → Registering marketplace routes...');
  console.log('    marketplaceRoutes type:', typeof marketplaceRoutes, marketplaceRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/marketplace`, marketplaceRoutes);
  console.log('  ✓ marketplace routes registered');
  
  console.log('  → Registering application routes...');
  console.log('    applicationRoutes type:', typeof applicationRoutes, applicationRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/applications`, applicationRoutes);
  console.log('  ✓ application routes registered');
  
  console.log('  → Registering chat routes...');
  console.log('    chatRoutes type:', typeof chatRoutes, chatRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/chats`, chatRoutes);
  console.log('  ✓ chat routes registered');
  
  console.log('  → Registering company routes...');
  console.log('    companyRoutes type:', typeof companyRoutes, companyRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/companies`, companyRoutes);
  console.log('  ✓ company routes registered');
  
  console.log('  → Registering admin routes...');
  console.log('    adminRoutes type:', typeof adminRoutes, adminRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/admin`, adminRoutes);
  console.log('  ✓ admin routes registered');
  
  console.log('  → Registering analytics routes...');
  console.log('    analyticsRoutes type:', typeof analyticsRoutes, analyticsRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/analytics`, analyticsRoutes);
  console.log('  ✓ analytics routes registered');
  
  console.log('  → Registering payment routes...');
  console.log('    paymentRoutes type:', typeof paymentRoutes, paymentRoutes.constructor?.name);
  app.use(`/api/${API_VERSION}/payments`, paymentRoutes);
  console.log('  ✓ payment routes registered');
  
// Register review routes
console.log('  → Registering reviews routes...');
app.use(`/api/${API_VERSION}/reviews`, reviewRoutes); // ✅ Use reviewRoutes (matches the import)

// ✅ Optional: Add this debug log to verify routes are registered
console.log('    ✓ Review routes registered at /api/v1/reviews');

  console.log('    reviewRoutes type:', typeof reviewRoutes, reviewRoutes.constructor?.name);

console.log('  → Registering notification routes...');
console.log('    notificationRoutes type:', typeof notificationRoutes, notificationRoutes.constructor?.name);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
console.log('  ✓ notification routes registered');


  // 404 handler
  app.use('*', (req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      status: 'error',
      message: `Route ${req.originalUrl} not found`
    });
  });
  console.log('  ✓ 404 handler');

  // Error handler
  app.use(errorHandler);
  console.log('  ✓ error handler');
  
  console.log('✅ Step 10: Routes configured');
} catch (error) {
  console.error('❌ Failed at Step 10:', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

console.log('Step 11: Initializing Socket handlers...');
try {
  initializeSocketHandlers(io);
  console.log('✅ Step 11: Socket handlers initialized');
} catch (error) {
  console.error('❌ Failed at Step 11:', error.message);
  console.error('Full error:', error);
  process.exit(1);
}

// 🚀 START SERVER
const startServer = async () => {
  try {
    console.log('\n🚀 ============ STARTING SERVER ============');

    console.log('→ Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected');

    console.log('→ Initializing Firebase...');
    initializeFirebase();
    console.log('✅ Firebase initialized');

    const PORT = process.env.PORT || 5000;
    const HOST = '0.0.0.0'; // Listen on all network interfaces

    server.listen(PORT, HOST, () => {
      console.log(`\n✨ ============================================`);
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🌐 Network access: http://192.168.1.161:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔧 Listening on: ${HOST}:${PORT}`);
      console.log(`✨ ============================================\n`);
      logger.info(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('👋 SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    });

    process.on('SIGINT', () => {
      console.log('\n👋 SIGINT received. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    });

    process.on('unhandledRejection', (err) => {
      console.error('❌ UNHANDLED REJECTION:', err);
      console.error('Stack:', err.stack);
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (err) => {
      console.error('❌ UNCAUGHT EXCEPTION:', err);
      console.error('Stack:', err.stack);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

console.log('Step 12: Calling startServer()...');
startServer();
console.log('✅ Step 12: startServer() called');

module.exports = { app, server, io };