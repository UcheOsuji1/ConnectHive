import { Router } from 'express';
import { getMyWaitlist, updateAnswers, getYoureIn, markYoureInSeen } from '../controllers/waitlistController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/',             getMyWaitlist);
router.put('/answers',      updateAnswers);
router.get('/youre-in',     getYoureIn);
router.post('/youre-in/seen', markYoureInSeen);

export default router;
