// At the top of socket.handlers.js
const Chat = require('../models/chat'); // Adjust the path to your actual Chat model
const Message = require('../models/Message');
const User = require('../models/User');
const Product = require('../models/Product');
const { verifyIdToken } = require('../config/firebase');
const logger = require('../config/logger');


// Store active users and their socket IDs
const activeUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId

/**
 * Initialize Socket.IO handlers
 */
const initializeSocketHandlers = (io) => {
  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify Firebase token
      const decodedToken = await verifyIdToken(token);
      
      // Find user in database
      const user = await User.findOne({ 
        firebaseUid: decodedToken.uid,
        isActive: true,
        isBlocked: false
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Check if user can use chat (not a guest)
      if (!user.canUseChat()) {
        return next(new Error('Guests cannot use chat. Please register.'));
      }

      // Attach user to socket
      socket.user = user;
      socket.userId = user._id.toString();
      
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Handle connection
  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`User connected: ${userId} (Socket: ${socket.id})`);

    // Store active user
    activeUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);

    // Notify user is online
    socket.broadcast.emit('user:online', { userId });

    // ==================== CHAT EVENTS ====================

   /**
 * Join a chat room
 */
socket.on('chat:join', async (data, callback) => {
  try {
    const { chatId } = data;
    const chat = await Chat.findById(chatId)
      .populate('participants.user', 'profile email')
      .populate('product');

    if (!chat) {
      if (typeof callback === 'function') return callback({ error: 'Chat not found' });
      return;
    }

    if (!chat.isParticipant(userId)) {
      if (typeof callback === 'function') return callback({ error: 'Not authorized' });
      return;
    }

    socket.join(chatId);
    await chat.markAsRead(userId);
    await Message.markAsRead(chatId, userId);
    const messages = await Message.getChatMessages(chatId, 1, 50);

    // Safety check for callback
    if (typeof callback === 'function') {
      callback({ 
        success: true, 
        chat,
        messages: messages.reverse() 
      });
    }

    logger.info(`User ${userId} joined chat ${chatId}`);
  } catch (error) {
    logger.error('Error joining chat:', error);
    if (typeof callback === 'function') callback({ error: 'Failed to join chat' });
  }
});
    

    /**
     * Leave a chat room
     */
    socket.on('chat:leave', async (data) => {
      try {
        const { chatId } = data;
        socket.leave(chatId);
        logger.info(`User ${userId} left chat ${chatId}`);
      } catch (error) {
        logger.error('Error leaving chat:', error);
      }
    });

    /**
     * Start/Create a new chat
     */
    socket.on('chat:start', async (data, callback) => {
      try {
        const { productId } = data;

        // Get product and verify it exists
        const product = await Product.findById(productId).populate('seller');

        if (!product) {
          return callback({ error: 'Product not found' });
        }

        if (!product.isAvailableForChat()) {
          return callback({ error: 'Chat not available for this product' });
        }

        // Cannot chat with yourself
        if (product.seller._id.toString() === userId) {
          return callback({ error: 'Cannot chat with yourself' });
        }

        // Find or create chat
        const chat = await Chat.findOrCreate(
          userId, 
          product.seller._id, 
          productId
        );

        // Join the chat room
        socket.join(chat._id.toString());

        // Increment product's chat initiated count
        product.stats.chatInitiated += 1;
        await product.save();

        callback({ 
          success: true, 
          chat
        });

        logger.info(`Chat started: ${chat._id} for product ${productId}`);
      } catch (error) {
        logger.error('Error starting chat:', error);
        callback({ error: 'Failed to start chat' });
      }
    });

   /**
 * Send a message
 */
socket.on('message:send', async (data, callback) => {
  try {
    const { chatId, content, type = 'text', media } = data;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      if (typeof callback === 'function') return callback({ error: 'Chat not found' });
      return;
    }

    if (!chat.isParticipant(userId)) {
      if (typeof callback === 'function') return callback({ error: 'Not authorized' });
      return;
    }

    const message = await Message.create({
      chat: chatId,
      sender: userId,
      content,
      type,
      media,
      status: 'sent'
    });

    await message.populate('sender', 'profile email');

    const otherParticipant = chat.getOtherParticipant(userId);
    if (otherParticipant) {
      await chat.incrementUnread(otherParticipant.user.toString());
    }

    io.to(chatId).emit('message:new', { message, chatId });

    // Safety check for callback
    if (typeof callback === 'function') {
      callback({ success: true, message });
    }

    logger.info(`Message sent in chat ${chatId} by user ${userId}`);
  } catch (error) {
    logger.error('Error sending message:', error);
    if (typeof callback === 'function') callback({ error: 'Failed to send message' });
  }
});

    /**
     * Typing indicator
     */
    socket.on('typing:start', async (data) => {
      try {
        const { chatId } = data;
        
        // Emit to chat room (except sender)
        socket.to(chatId).emit('typing:user', {
          chatId,
          userId,
          isTyping: true
        });
      } catch (error) {
        logger.error('Error handling typing start:', error);
      }
    });

    socket.on('typing:stop', async (data) => {
      try {
        const { chatId } = data;
        
        socket.to(chatId).emit('typing:user', {
          chatId,
          userId,
          isTyping: false
        });
      } catch (error) {
        logger.error('Error handling typing stop:', error);
      }
    });

    /**
     * Mark messages as read
     */
    socket.on('message:read', async (data) => {
      try {
        const { chatId, messageIds } = data;

        // Verify user is participant
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isParticipant(userId)) {
          return;
        }

        // Mark specific messages as read
        if (messageIds && messageIds.length > 0) {
          await Message.updateMany(
            { 
              _id: { $in: messageIds },
              chat: chatId 
            },
            { 
              status: 'read',
              $addToSet: { 
                readBy: { 
                  user: userId, 
                  readAt: new Date() 
                } 
              }
            }
          );
        } else {
          // Mark all unread messages as read
          await Message.markAsRead(chatId, userId);
        }

        // Notify other participant
        socket.to(chatId).emit('message:read_receipt', {
          chatId,
          userId,
          messageIds,
          readAt: new Date()
        });

      } catch (error) {
        logger.error('Error marking messages as read:', error);
      }
    });

    /**
     * Delete a message
     */
    socket.on('message:delete', async (data, callback) => {
      try {
        const { messageId } = data;

        const message = await Message.findById(messageId);

        if (!message) {
          return callback({ error: 'Message not found' });
        }

        // Only sender can delete their own message
        if (message.sender.toString() !== userId) {
          return callback({ error: 'Not authorized to delete this message' });
        }

        message.deleted = true;
        message.deletedAt = new Date();
        await message.save();

        // Notify chat room
        io.to(message.chat.toString()).emit('message:deleted', {
          messageId,
          chatId: message.chat
        });

        callback({ success: true });

      } catch (error) {
        logger.error('Error deleting message:', error);
        callback({ error: 'Failed to delete message' });
      }
    });

    /**
     * Get chat history with pagination
     */
    socket.on('chat:load_more', async (data, callback) => {
      try {
        const { chatId, page = 1, limit = 50 } = data;

        // Verify user is participant
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isParticipant(userId)) {
          return callback({ error: 'Not authorized' });
        }

        const messages = await Message.getChatMessages(chatId, page, limit);

        callback({ 
          success: true, 
          messages: messages.reverse(),
          hasMore: messages.length === limit
        });

      } catch (error) {
        logger.error('Error loading chat history:', error);
        callback({ error: 'Failed to load messages' });
      }
    });

    // ==================== DISCONNECTION ====================

    socket.on('disconnect', () => {
      const disconnectedUserId = userSockets.get(socket.id);
      
      if (disconnectedUserId) {
        activeUsers.delete(disconnectedUserId);
        userSockets.delete(socket.id);
        
        // Notify others that user went offline
        socket.broadcast.emit('user:offline', { 
          userId: disconnectedUserId 
        });
        
        logger.info(`User disconnected: ${disconnectedUserId} (Socket: ${socket.id})`);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  logger.info('Socket.IO handlers initialized');
};

/**
 * Get online status of users
 */
const getOnlineUsers = () => {
  return Array.from(activeUsers.keys());
};

/**
 * Check if user is online
 */
const isUserOnline = (userId) => {
  return activeUsers.has(userId);
};

/**
 * Send notification to specific user
 */
const sendToUser = (io, userId, event, data) => {
  const socketId = activeUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

module.exports = {
  initializeSocketHandlers,
  getOnlineUsers,
  isUserOnline,
  sendToUser
};