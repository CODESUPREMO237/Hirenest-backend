// ============================================
// Chat.js - Chat Room Model
// ============================================
// ============================================
// Chat.js - Chat Room Model
// ============================================
const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    unreadCount: {
      type: Number,
      default: 0
    }
  }],

  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
    index: true
  },

  status: {
    type: String,
    enum: ['active', 'archived', 'blocked'],
    default: 'active'
  },

  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    type: {
      type: String,
      enum: ['text', 'image', 'file'],
      default: 'text'
    }
  },

  typing: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isTyping: {
      type: Boolean,
      default: false
    },
    lastTypingTime: Date
  }],

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

// Indexes
chatSchema.index({ 'participants.user': 1 });
chatSchema.index({ product: 1, 'participants.user': 1 });
chatSchema.index({ status: 1, updatedAt: -1 });

// Instance Methods
chatSchema.methods.getOtherParticipant = function(userId) {
  if (!Array.isArray(this.participants)) return null;
  return this.participants.find(p => p.user?.toString() !== userId.toString()) || null;
};

chatSchema.methods.getParticipant = function(userId) {
  if (!Array.isArray(this.participants)) return null;
  return this.participants.find(p => p.user?.toString() === userId.toString()) || null;
};

chatSchema.methods.isParticipant = function(userId) {
  if (!Array.isArray(this.participants)) return false;
  
  const searchId = userId.toString();
  
  return this.participants.some(p => {
    if (!p.user) return false;
    // Check if p.user is an object (populated) or just an ID
    const participantId = p.user._id ? p.user._id.toString() : p.user.toString();
    return participantId === searchId;
  });
};

chatSchema.methods.markAsRead = async function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.unreadCount = 0;
    participant.lastSeen = new Date();
    await this.save();
  }
};

chatSchema.methods.incrementUnread = async function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.unreadCount += 1;
    await this.save();
  }
};

// Static Methods
chatSchema.statics.findOrCreate = async function(buyerId, sellerId, productId) {
  if (!buyerId || !sellerId || !productId) return null;

  let chat = await this.findOne({
    product: productId,
    'participants.user': { $all: [buyerId, sellerId] }
  }).populate('participants.user product');

  if (!chat) {
    chat = await this.create({
      participants: [
        { user: buyerId, role: 'buyer', lastSeen: new Date() },
        { user: sellerId, role: 'seller', lastSeen: new Date() }
      ],
      product: productId
    });
    chat = await chat.populate('participants.user product');
  }

  return chat;
};

chatSchema.statics.getUserChats = async function(userId, status = 'active') {
  if (!userId) return [];
  return this.find({
    'participants.user': userId,
    status
  })
  .populate('participants.user', 'profile email role marketplaceStats')
  .populate('product', 'name images price status seller')
  .sort({ updatedAt: -1 })
  .lean(); // lean() returns plain JS objects
};

// lib/models/Chat.js

// ... (existing schema code)

// Static Methods - UPDATED for the Hybrid Approach
chatSchema.statics.findOrCreate = async function(buyerId, sellerId, productId) {
  if (!buyerId || !sellerId) return null;

  // 1. Search for ANY active direct chat between these two people
  let chat = await this.findOne({
    'participants.user': { $all: [buyerId, sellerId] },
    status: 'active'
  }).populate('participants.user product');

  if (!chat) {
    // 2. If no chat exists, create a brand new one
    chat = await this.create({
      participants: [
        { user: buyerId, role: 'buyer', lastSeen: new Date() },
        { user: sellerId, role: 'seller', lastSeen: new Date() }
      ],
      product: productId || null // Attach product context if provided
    });
    chat = await chat.populate('participants.user product');
  } else {
    // 3. If chat exists, update the product context to the new product
    if (productId && (!chat.product || chat.product._id.toString() !== productId.toString())) {
      chat.product = productId;
      await chat.save();
      // Re-populate after saving to ensure UI gets full product info
      await chat.populate('product');
    }
  }

  return chat;
};



// Ensure we don't overwrite the model if it's already compiled
module.exports = mongoose.models.Chat || mongoose.model('Chat', chatSchema);