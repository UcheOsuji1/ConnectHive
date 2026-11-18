import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getProfile,
  updateProfile,
  updateCollabProfile,
  setupProfile,
  setLocationFromCoords,
  setMaxDistance,
  getCompatibility,
  getActivity,
  getSuggestions,
  getMemberProfile,
  getMemberActivity,
  deleteConnection,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getMyConnections,
  getMyNetwork,
  getPersonalUploadSignature,
} from '../controllers/usersController.js';
import { getUserPosts } from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';
import { LIMITS } from '../lib/limits.js';
import { isUuid } from '../lib/isUuid.js';

const router = Router();

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Member not found.' });
  next();
});
router.param('hiveId', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Hive not found.' });
  next();
});

// Keyed on the authenticated user, not IP — requireAuth runs first.
const profileCollabLimiter = rateLimit({
  ...LIMITS.profileCollab,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many profile updates — slow down and try again later.' },
});

router.get('/profile',               requireAuth, getProfile);
router.put('/profile',               requireAuth, updateProfile);
router.patch('/profile/collab',      requireAuth, profileCollabLimiter, updateCollabProfile);
router.post('/profile/setup',        requireAuth, setupProfile);
router.post('/location',             requireAuth, setLocationFromCoords);
router.put('/max-distance',          requireAuth, setMaxDistance);
router.get('/compatibility/:hiveId', requireAuth, getCompatibility);
router.get('/activity',              requireAuth, getActivity);
router.get('/suggestions',           requireAuth, getSuggestions);
router.get('/me/network',            requireAuth, getMyNetwork);
router.get('/me/connections',        requireAuth, getMyConnections);
router.get('/me/upload-signature',   requireAuth, getPersonalUploadSignature);
// Static paths above must stay ahead of these parameterised ones.
router.get('/:id/profile',           requireAuth, getMemberProfile);
router.get('/:id/activity',          requireAuth, getMemberActivity);
router.delete('/:id/connection',     requireAuth, deleteConnection);
router.post('/:id/follow',           requireAuth, followUser);
router.delete('/:id/follow',         requireAuth, unfollowUser);
router.get('/:id/followers',         requireAuth, getFollowers);
router.get('/:id/following',         requireAuth, getFollowing);
router.get('/:id/posts',             requireAuth, getUserPosts);

export default router;
