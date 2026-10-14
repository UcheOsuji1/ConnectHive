import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPost,
  getFeed,
  getPost,
  deletePost,
  toggleReaction,
  getReactors,
  addComment,
  getComments,
  deleteComment,
  updatePostVisibility,
} from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';
import { LIMITS } from '../lib/limits.js';

const router = Router();

// Keyed on the authenticated user, not IP — requireAuth runs first on every
// route below, so req.userId is always set by the time these run.
const postLimiter = rateLimit({
  ...LIMITS.posts,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many posts — slow down and try again later.' },
});
const commentLimiter = rateLimit({
  ...LIMITS.comments,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
  message: { error: 'Too many comments — slow down and try again shortly.' },
});

// Static sub-paths must precede /:id
router.post('/',                       requireAuth, postLimiter, createPost);
router.get('/feed',                    requireAuth, getFeed);
router.delete('/comments/:commentId',  requireAuth, deleteComment);

// Single post
router.get('/:id',                     requireAuth, getPost);
router.delete('/:id',                  requireAuth, deletePost);
router.patch('/:id/visibility',        requireAuth, updatePostVisibility);

// Post actions
router.post('/:id/react',              requireAuth, toggleReaction);
router.get('/:id/reactors',            requireAuth, getReactors);
router.post('/:id/comments',           requireAuth, commentLimiter, addComment);
router.get('/:id/comments',            requireAuth, getComments);

export default router;
