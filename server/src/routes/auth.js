import { Router }    from 'express';
import rateLimit     from 'express-rate-limit';
import {
  register,
  login,
  logout,
  getMe,
  googleRedirect,
  googleCallback,
  resendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts — try again in an hour.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in 15 minutes.' },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests — try again in an hour.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/register', registerLimiter, register);
router.post('/login',    loginLimiter,    login);
router.post('/logout',                   logout);
router.get('/me',        requireAuth,     getMe);

// Google OAuth (redirect-based, server-side callback)
router.get('/google',          googleRedirect);
router.get('/google/callback', googleCallback);

// Email verification
router.post('/verify-email',          verifyEmail);
router.post('/resend-verification',   requireAuth, resendVerification);

// Password reset
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password',                 resetPassword);

export default router;
