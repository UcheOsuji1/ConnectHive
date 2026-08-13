import { Router } from 'express';
import { getUpcomingEvents, toggleRsvp } from '../controllers/eventsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/upcoming',        requireAuth, getUpcomingEvents);
router.post('/:postId/rsvp',   requireAuth, toggleRsvp);

export default router;
