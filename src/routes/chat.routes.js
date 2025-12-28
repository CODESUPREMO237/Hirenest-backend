const express = require('express');
const router = express.Router();
const {
  getMyChats,
  startChat,      // <--- ADD THIS: You were using it but hadn't imported it!
  getOrCreateChat, 
  getChatById,
  getChatMessages,
  sendMessage,
  deleteMessage,
  archiveChat,
  getUnreadCount,
  markAsRead
} = require('../controllers/chat.controller');

const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate, sendMessageSchema } = require('../middleware/validation.middleware');

// All chat routes require authentication and specific roles
router.use(authenticate);
router.use(authorize('jobseeker', 'employer'));

// ==================== CHAT LIST & STATS ====================

// GET /api/v1/chats
router.get('/', getMyChats); 

// POST /api/v1/chats -> Handled by startChat (Matches Flutter getOrCreateChat)
router.post('/', startChat); 

// GET /api/v1/chats/unread-count
router.get('/unread-count', getUnreadCount); 

// ==================== CHAT MANAGEMENT ====================

// POST /api/v1/chats/product/:productId (Matches Flutter startChatWithProduct)
router.post('/product/:productId', getOrCreateChat); 

// GET /api/v1/chats/:id
router.get('/:id', getChatById); 

// ADD THIS ROUTE HERE:
// PUT /api/v1/chats/:id/read
router.put('/:id/read', markAsRead); // <--- 2. Add this line

// PUT /api/v1/chats/:id/archive
router.put('/:id/archive', archiveChat); 

// ==================== MESSAGES ====================

// GET /api/v1/chats/:id/messages
router.get('/:id/messages', getChatMessages); 

// POST /api/v1/chats/:id/messages
router.post('/:id/messages', validate(sendMessageSchema), sendMessage); 

// DELETE /api/v1/chats/messages/:messageId
router.delete('/messages/:messageId', deleteMessage); 

module.exports = router;