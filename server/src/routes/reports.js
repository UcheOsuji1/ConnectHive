import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createReport } from '../controllers/reportsController.js';
import { requireAuth } from '../middleware/auth.js';
import { LIMITS } from '../lib/limits.js';

const router = Router();

// Keyed on the authenticated user, not IP, since requireAuth runs first and
// req.userId is always set by here.
const reportLimiter = rateLimit({
  ...LIMITS.reports,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many reports — try again later.' },
});

router.post('/', requireAuth, reportLimiter, createReport);

export default router;
