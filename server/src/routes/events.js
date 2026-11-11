import { Router } from 'express';
import { getUpcomingEvents, toggleRsvp, getPlanAttendees } from '../controllers/eventsController.js';
import { requireAuth } from '../middleware/auth.js';
import { isUuid } from '../lib/isUuid.js';

const router = Router();

router.param('postId', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Plan not found.' });
  next();
});

router.get('/upcoming',           requireAuth, getUpcomingEvents);
router.post('/:postId/rsvp',      requireAuth, toggleRsvp);
router.get('/:postId/attendees',  requireAuth, getPlanAttendees);

export default router;
