import { Router } from 'express';
import { getProfile, updateProfile, setupProfile, getCompatibility } from '../controllers/usersController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/profile/setup', authenticate, setupProfile);
router.get('/compatibility/:hiveId', authenticate, getCompatibility);

export default router;
