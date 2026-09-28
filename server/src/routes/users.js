import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  setupProfile,
  getCompatibility,
  getActivity,
  getSuggestions,
  getMemberProfile,
  getMemberActivity,
} from '../controllers/usersController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/profile',               requireAuth, getProfile);
router.put('/profile',               requireAuth, updateProfile);
router.post('/profile/setup',        requireAuth, setupProfile);
router.get('/compatibility/:hiveId', requireAuth, getCompatibility);
router.get('/activity',              requireAuth, getActivity);
router.get('/suggestions',           requireAuth, getSuggestions);
// Static paths above must stay ahead of these parameterised ones.
router.get('/:id/profile',           requireAuth, getMemberProfile);
router.get('/:id/activity',          requireAuth, getMemberActivity);

export default router;
