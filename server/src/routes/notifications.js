import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../controllers/notificationsController.js';
import { requireAuth } from '../middleware/auth.js';
import { isUuid } from '../lib/isUuid.js';

const router = Router();

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Notification not found.' });
  next();
});

// Static paths before /:id
router.get('/',             requireAuth, getNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.post('/read-all',    requireAuth, markAllRead);
router.post('/:id/read',    requireAuth, markRead);

export default router;
