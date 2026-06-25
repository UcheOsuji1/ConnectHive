import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  setupProfile,
  getCompatibility,
} from '../controllers/usersController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/profile',               requireAuth, getProfile);
router.put('/profile',               requireAuth, updateProfile);
router.post('/profile/setup',        requireAuth, setupProfile);
router.get('/compatibility/:hiveId', requireAuth, getCompatibility);

export default router;
