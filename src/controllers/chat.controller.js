const Chat = require('../models/chat');
const Product = require('../models/Product');
const User = require('../models/User');
const logger = require('../config/logger');
const Message = require('../models/Message');
const { sendNewMessageEmail } = require('../services/email.service');

/**
 * Get all my chats
 */
const startChat = async (req, res) => {
  try {
    const { receiverId, productId } = req.body; 
    const senderId = req.user._id;

    // 1. ALWAYS search for a chat between these two users first (ignore productId in the search)
    // This ensures they only ever have ONE conversation thread.
    let chat = await Chat.findOne({
      'participants.user': { $all: [senderId, receiverId] }
    });

    if (!chat) {
      // 2. Only if no chat exists, create a new one with the productId context
      chat = await Chat.create({
        participants: [
          { user: senderId, role: 'buyer', unreadCount: 0 },
          { user: receiverId, role: 'seller', unreadCount: 0 }
        ],
        product: productId || null, 
        status: 'active'
      });
      
      chat = await chat.populate('participants.user', 'profile email role');
    } else {
      // 3. OPTIONAL: If a chat existed but was archived, reactivate it
      if (chat.status === 'archived') {
        chat.status = 'active';
        await chat.save();
      }
      
      // 4. OPTIONAL: Update the 'product' reference to the LATEST product they are discussing
      if (productId && (!chat.product || chat.product.toString() !== productId)) {
        chat.product = productId;
        await chat.save();
      }
    }

    res.status(200).json({
      status: 'success',
      data: { chat }
    });
  } catch (error) {
    logger.error("Start Chat Error:", error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};


const getMyChats = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      logger.warn('Unauthorized access attempt to getMyChats');
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized'
      });
    }

    const { status = 'active' } = req.query;

    // Defensive: ensure Chat.getUserChats exists
    if (typeof Chat.getUserChats !== 'function') {
      logger.error('Chat.getUserChats method is undefined');
      return res.status(500).json({
        status: 'error',
        message: 'Server configuration error'
      });
    }

    const chats = await Chat.getUserChats(userId, status);

    res.status(200).json({
      status: 'success',
      data: { chats: chats || [] } // always return an array
    });
  } catch (error) {
    logger.error('Error fetching chats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching chats'
    });
  }
};

/**
 * Get or create chat with seller
 */
const getOrCreateChat = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Get product and verify it exists
    const product = await Product.findById(productId).populate('seller');

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    if (!product.isAvailableForChat()) {
      return res.status(400).json({
        status: 'error',
        message: 'Chat not available for this product'
      });
    }

    // Cannot chat with yourself
    if (product.seller._id.toString() === userId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot chat with yourself'
      });
    }

    // Find or create chat
    const chat = await Chat.findOrCreate(
      userId,
      product.seller._id,
      productId
    );

    res.status(200).json({
      status: 'success',
      data: { chat }
    });
  } catch (error) {
    logger.error('Error creating chat:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error creating chat'
    });
  }
};

/**
 * Get chat by ID
 */
const getChatById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(id)
      .populate('participants.user', 'profile email role marketplaceStats')
      .populate('product', 'name images price status seller');

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    // Mark as read
    await chat.markAsRead(userId);

    res.status(200).json({
      status: 'success',
      data: { chat }
    });
  } catch (error) {
    logger.error('Error fetching chat:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching chat'
    });
  }
};

/**
 * Get chat messages with pagination
 */
const getChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    // Verify user is participant
    const chat = await Chat.findById(id);

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    // Get messages
    const messages = await Message.getChatMessages(
      id,
      parseInt(page),
      parseInt(limit)
    );

    // Mark messages as read
    await Message.markAsRead(id, userId);
    await chat.markAsRead(userId);

    res.status(200).json({
      status: 'success',
      data: {
        messages: messages.reverse(), // Oldest first
        hasMore: messages.length === parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching messages'
    });
  }
};

/**
 * Send message (REST endpoint - fallback for Socket.IO)
 */
const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type = 'text', media } = req.body;
    const userId = req.user._id;

    // 1. Verify chat and participants
    const chat = await Chat.findById(id).populate('participants.user', 'profile email');

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    // 2. Create message
    const message = await Message.create({
      chat: id,
      sender: userId,
      content,
      type,
      media,
      status: 'sent'
    });

    // 3. Update unread counts
    const otherParticipantEntry = chat.getOtherParticipant(userId);
    let recipientUser = null;

    if (otherParticipantEntry) {
      const recipientId = otherParticipantEntry.user._id || otherParticipantEntry.user;
      await chat.incrementUnread(recipientId.toString());
      
      // Fetch full recipient details for the email service
      recipientUser = await User.findById(recipientId);
    }

    // 4. Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('message:new', {
        message,
        chatId: id
      });
    }

    // 5. Send response immediately to the sender
    res.status(201).json({
      status: 'success',
      data: { message }
    });

    // 6. Debounced Background Notification (5-minute delay)
    if (recipientUser) {
      setTimeout(async () => {
        try {
          // RE-FETCH the chat and recipient to see if they read it during the 5 mins
          const freshChat = await Chat.findById(id);
          const freshRecipient = await User.findById(recipientUser._id);
          
          if (!freshChat || !freshRecipient) {
            return;
          }

          const participantData = freshChat.participants.find(
            p => p.user.toString() === recipientUser._id.toString()
          );

          // ONLY send email if they still have unread messages in THIS chat
          if (participantData && participantData.unreadCount > 0) {
            await sendNewMessageEmail(
              freshRecipient.email,
              freshRecipient.profile.firstName || 'User',
              req.user.profile.displayName || 'A user',
              `You have ${participantData.unreadCount} new messages.`,
              `https://your-app-url.com/messages/${id}`
            );
            logger.info(`Debounced email sent to ${freshRecipient.email} for chat ${id}`);
          }
        } catch (err) {
          logger.error('Error in debounced email worker:', err);
        }
      }, 5 * 60 * 1000); // 5 Minutes
    }

  } catch (error) {
    logger.error('Error sending message:', error);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: 'Error sending message'
      });
    }
  }
};

/**
 * Delete message
 */
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found'
      });
    }

    // Only sender can delete their message
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only delete your own messages'
      });
    }

    message.deleted = true;
    message.deletedAt = new Date();
    await message.save();

    // Notify via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(message.chat.toString()).emit('message:deleted', {
        messageId,
        chatId: message.chat
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Message deleted'
    });
  } catch (error) {
    logger.error('Error deleting message:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error deleting message'
    });
  }
};

/**
 * Standalone Mark as Read (Fixes the 404 error)
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params; // chat ID
    const userId = req.user._id;

    const chat = await Chat.findById(id);
    if (!chat) return res.status(404).json({ status: 'error', message: 'Chat not found' });

    // 1. Clear my unread badges in the database
    await chat.markAsRead(userId);
    await Message.markAsRead(id, userId);

    // 2. WHATSAPP LOGIC: Notify the other person via Socket
    const io = req.app.get('io');
    if (io) {
      // We tell everyone in the room that messages were read by userId
      io.to(id).emit('message:read_receipt', {
        chatId: id,
        readerId: userId,
        readAt: new Date()
      });
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Archive chat
 */
const archiveChat = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(id);

    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access'
      });
    }

    chat.status = 'archived';
    await chat.save();

    res.status(200).json({
      status: 'success',
      message: 'Chat archived'
    });
  } catch (error) {
    logger.error('Error archiving chat:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error archiving chat'
    });
  }
};

/**
 * Get unread message count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      logger.warn('Unauthorized access attempt to getUnreadCount');
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized'
      });
    }

    const chats = await Chat.find({
      'participants.user': userId,
      status: 'active'
    }).lean(); // lean() avoids mongoose documents if we only need plain objects

    let totalUnread = 0;

    if (Array.isArray(chats) && chats.length > 0) {
      for (const chat of chats) {
        if (!Array.isArray(chat.participants)) continue;
        const participant = chat.participants.find(
          p => p.user?.toString() === userId.toString()
        );
        if (participant?.unreadCount) {
          totalUnread += participant.unreadCount;
        }
      }
    }

    res.status(200).json({
      status: 'success',
      data: { unreadCount: totalUnread }
    });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching unread count'
    });
  }
};

module.exports = {
  startChat,
  getMyChats,
  getOrCreateChat,
  getChatById,
  getChatMessages,
  sendMessage,
  deleteMessage,
  markAsRead,
  archiveChat,
  getUnreadCount
};