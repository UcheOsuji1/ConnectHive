import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listConversations,
  openConversation,
  getConversation,
  getMessages,
  sendToUser,
  sendToConversation,
  editMessage,
  deleteMessage,
  markRead,
  ignoreRequest,
  hideConversation,
  muteConversation,
  getUnreadCount,
  getRecipients,
  getUploadSignature,
} from '../controllers/dmController.js';
import { requireAuth } from '../middleware/auth.js';
import { LIMITS } from '../lib/limits.js';
import { isUuid } from '../lib/isUuid.js';

const router = Router();

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Conversation not found.' });
  next();
});
router.param('messageId', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Message not found.' });
  next();
});

// Keyed on the authenticated user, not IP — requireAuth runs first. The
// 10-requests-per-day cap is enforced in the controller from the database.
const sendLimiter = rateLimit({
  ...LIMITS.dmMessages,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: "You're sending messages too fast. Wait a moment and try again." },
});

router.use(requireAuth);

router.get('/unread-count',                 getUnreadCount);
router.get('/recipients',                   getRecipients);
router.get('/upload-signature',             getUploadSignature);
router.get('/conversations',                listConversations);
router.post('/conversations',               openConversation);
router.get('/conversations/:id',            getConversation);
router.get('/conversations/:id/messages',   getMessages);
router.post('/conversations/:id/messages',  sendLimiter, sendToConversation);
router.post('/conversations/:id/read',      markRead);
router.post('/conversations/:id/ignore',    ignoreRequest);
router.post('/conversations/:id/hide',      hideConversation);
router.post('/conversations/:id/mute',      muteConversation);
router.post('/messages',                    sendLimiter, sendToUser);
router.patch('/messages/:messageId',        editMessage);
router.delete('/messages/:messageId',       deleteMessage);

export default router;
