import { Router } from 'express';
import {
  getHives,
  getHive,
  getHiveMembers,
  createHive,
  saveDraft,
  matchHives,
  updateHive,
  joinHive,
  getMyHive,
  getHiveMessages,
  followHive,
  unfollowHive,
  getFollowedHives,
} from '../controllers/hivesController.js';
import { requireAuth } from '../middleware/auth.js';
import { getHivePosts } from '../controllers/postsController.js';

const router = Router();

// ── Static paths (must come before /:id) ─────────────────────────────────────
router.post('/match',      matchHives);
router.post('/draft',      requireAuth, saveDraft);
router.get('/mine',        requireAuth, getMyHive);
router.get('/my',          requireAuth, getMyHive);   // alias kept for compat
router.get('/following',   requireAuth, getFollowedHives);

// ── Collection ────────────────────────────────────────────────────────────────
router.get('/',    getHives);
router.post('/',   requireAuth, createHive);

// ── Single hive by id ─────────────────────────────────────────────────────────
router.get('/:id',             requireAuth, getHive);
router.put('/:id',             requireAuth, updateHive);

// ── Member & follower actions ──────────────────────────────────────────────────
router.get('/:id/members',     requireAuth, getHiveMembers);
router.post('/:id/join',       requireAuth, joinHive);
router.get('/:id/messages',    requireAuth, getHiveMessages);
router.post('/:id/follow',     requireAuth, followHive);
router.delete('/:id/follow',   requireAuth, unfollowHive);
router.get('/:id/posts',       requireAuth, getHivePosts);

export default router;
