import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createReport } from '../controllers/reportsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 10 reports per hour per user — keyed on the authenticated user, not IP,
// since requireAuth runs first and req.userId is always set by here.
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many reports — try again later.' },
});

router.post('/', requireAuth, reportLimiter, createReport);

export default router;
