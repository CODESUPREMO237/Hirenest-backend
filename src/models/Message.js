// ============================================
// Message.js - Message Model
// ============================================
const mongoose = require('mongoose');


const messageSchema = new mongoose.Schema({
  // Chat Room
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
    index: true
  },

  // Sender
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    
  },

  // Message Content
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },

  content: {
    type: String,
    required: true,
    maxlength: 5000
  },

  // For media messages
  media: {
    url: String,
    filename: String,
    mimeType: String,
    size: Number, // in bytes
    publicId: String // For Cloudinary
  },

  // Message Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },

  // Read Receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Delivery Receipts
  deliveredTo: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Reply/Thread
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },

  // Reactions (optional feature)
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Soft delete
  deleted: {
    type: Boolean,
    default: false
  },

  deletedAt: Date,

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }

}, {
  timestamps: true
});

// Indexes
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ status: 1 });

// Update chat's lastMessage when new message is created
// Update chat's lastMessage when new message is created
messageSchema.post('save', async function(doc) {
  try {
    // Use mongoose.model to avoid circular dependency errors
    const Chat = mongoose.model('Chat'); 
    
    await Chat.findByIdAndUpdate(doc.chat, {
      lastMessage: {
        content: doc.content,
        sender: doc.sender,
        timestamp: doc.createdAt,
        type: doc.type
      },
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error updating chat lastMessage:', error);
  }
});

// Static method to get chat messages with pagination
messageSchema.statics.getChatMessages = function(chatId, page = 1, limit = 50) {
  return this.find({ 
    chat: chatId,
    deleted: false
  })
  .populate('sender', 'profile email')
  .populate('replyTo')
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip((page - 1) * limit);
};

// Static method to mark messages as read
messageSchema.statics.markAsRead = async function(chatId, userId) {
  const messages = await this.find({
    chat: chatId,
    sender: { $ne: userId },
    status: { $ne: 'read' }
  });

  const updatePromises = messages.map(msg => {
    msg.status = 'read';
    if (!msg.readBy.some(r => r.user.toString() === userId.toString())) {
      msg.readBy.push({ user: userId, readAt: new Date() });
    }
    return msg.save();
  });

  await Promise.all(updatePromises);
};

// Static method to get unread count
messageSchema.statics.getUnreadCount = function(chatId, userId) {
  return this.countDocuments({
    chat: chatId,
    sender: { $ne: userId },
    status: { $ne: 'read' },
    deleted: false
  });
};

const Message = mongoose.model('Message', messageSchema);

// Export both models
module.exports = Message;