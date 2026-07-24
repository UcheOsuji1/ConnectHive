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
  markHiveSeen,
  markWelcomeSeen,
  getHiveMessages,
  followHive,
  unfollowHive,
  getFollowedHives,
  updateMemberRole,
  removeMember,
  notifyMember,
} from '../controllers/hivesController.js';
import {
  getOnboarding,
  updateOnboarding,
  createStep,
  updateStep,
  deleteStep,
  reorderSteps,
  getMyProgress,
  completeStep,
  uncompleteStep,
} from '../controllers/onboardingController.js';
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
router.post('/:id/seen',                 requireAuth, markHiveSeen);
router.post('/:id/welcome-seen',         requireAuth, markWelcomeSeen);
router.get('/:id/overview',              requireAuth, getHiveOverview);
router.get('/:id/members',                requireAuth, getHiveMembers);
router.patch('/:id/members/:userId/role',   requireAuth, updateMemberRole);
router.post('/:id/members/:userId/notify', requireAuth, notifyMember);
router.delete('/:id/members/:userId',      requireAuth, removeMember);
router.post('/:id/join',                  requireAuth, joinHive);
router.post('/:id/request',              requireAuth, requestToJoin);
router.get('/:id/requests',              requireAuth, getHiveRequests);
router.post('/:id/requests/:requestId',  requireAuth, reviewRequest);
router.get('/:id/messages',              requireAuth, getHiveMessages);
router.post('/:id/follow',               requireAuth, followHive);
router.delete('/:id/follow',             requireAuth, unfollowHive);
router.get('/:id/posts',                 requireAuth, getHivePosts);

// ── Onboarding ────────────────────────────────────────────────────────────────
router.get('/:id/onboarding',                                requireAuth, getOnboarding);
router.put('/:id/onboarding',                                requireAuth, updateOnboarding);
router.get('/:id/onboarding/me',                             requireAuth, getMyProgress);
router.post('/:id/onboarding/steps/reorder',                 requireAuth, reorderSteps);
router.post('/:id/onboarding/steps',                         requireAuth, createStep);
router.put('/:id/onboarding/steps/:stepId',                  requireAuth, updateStep);
router.delete('/:id/onboarding/steps/:stepId/complete',      requireAuth, uncompleteStep);
router.post('/:id/onboarding/steps/:stepId/complete',        requireAuth, completeStep);
router.delete('/:id/onboarding/steps/:stepId',               requireAuth, deleteStep);

export default router;
