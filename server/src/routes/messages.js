import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  updateMessage,
  deleteMessage,
  toggleReaction,
} from '../controllers/messagesController.js';

const router = Router();

router.patch('/:messageId',          requireAuth, updateMessage);
router.delete('/:messageId',         requireAuth, deleteMessage);
router.post('/:messageId/reactions', requireAuth, toggleReaction);

export default router;
