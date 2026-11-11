import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { isUuid } from '../lib/isUuid.js';
import {
  updateMessage,
  deleteMessage,
  toggleReaction,
} from '../controllers/messagesController.js';

const router = Router();

router.param('messageId', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Message not found.' });
  next();
});

router.patch('/:messageId',          requireAuth, updateMessage);
router.delete('/:messageId',         requireAuth, deleteMessage);
router.post('/:messageId/reactions', requireAuth, toggleReaction);

export default router;
