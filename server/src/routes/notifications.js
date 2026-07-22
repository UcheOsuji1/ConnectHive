import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../controllers/notificationsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Static paths before /:id
router.get('/',             requireAuth, getNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.post('/read-all',    requireAuth, markAllRead);
router.post('/:id/read',    requireAuth, markRead);

export default router;
