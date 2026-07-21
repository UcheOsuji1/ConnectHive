import { Router } from 'express';
import {
  getHives,
  getHive,
  getHiveMembers,
  createHive,
  saveDraft,
  matchHives,
  joinWaitlist,
  updateHive,
  getHiveOverview,
  joinHive,
  requestToJoin,
  getHiveRequests,
  reviewRequest,
  getMyRequests,
  getMyHive,
  getHiveMessages,
  followHive,
  unfollowHive,
  getFollowedHives,
  updateMemberRole,
  removeMember,
} from '../controllers/hivesController.js';
import { requireAuth } from '../middleware/auth.js';
import { getHivePosts } from '../controllers/postsController.js';

const router = Router();

// ── Static paths (must come before /:id) ─────────────────────────────────────
router.post('/match',         requireAuth, matchHives);
router.post('/waitlist',      requireAuth, joinWaitlist);
router.post('/draft',         requireAuth, saveDraft);
router.get('/mine',           requireAuth, getMyHive);
router.get('/my',             requireAuth, getMyHive);   // alias kept for compat
router.get('/following',      requireAuth, getFollowedHives);
router.get('/requests/mine',  requireAuth, getMyRequests);

// ── Collection ────────────────────────────────────────────────────────────────
router.get('/',    getHives);
router.post('/',   requireAuth, createHive);

// ── Single hive by id ─────────────────────────────────────────────────────────
router.get('/:id',             requireAuth, getHive);
router.put('/:id',             requireAuth, updateHive);
router.patch('/:id',           requireAuth, updateHive);

// ── Member & follower actions ──────────────────────────────────────────────────
router.get('/:id/overview',              requireAuth, getHiveOverview);
router.get('/:id/members',                requireAuth, getHiveMembers);
router.patch('/:id/members/:userId/role', requireAuth, updateMemberRole);
router.delete('/:id/members/:userId',     requireAuth, removeMember);
router.post('/:id/join',                  requireAuth, joinHive);
router.post('/:id/request',              requireAuth, requestToJoin);
router.get('/:id/requests',              requireAuth, getHiveRequests);
router.post('/:id/requests/:requestId',  requireAuth, reviewRequest);
router.get('/:id/messages',              requireAuth, getHiveMessages);
router.post('/:id/follow',               requireAuth, followHive);
router.delete('/:id/follow',             requireAuth, unfollowHive);
router.get('/:id/posts',                 requireAuth, getHivePosts);

export default router;
