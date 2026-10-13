import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDeletionCheck, deleteAccount } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Re-auth (password attempts) lives behind this limiter — same shape as login's.
const deleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again in 15 minutes.' },
});

router.get('/deletion-check', requireAuth, getDeletionCheck);
router.post('/delete',        requireAuth, deleteLimiter, deleteAccount);

export default router;
