import { Router } from 'express';
import {
  createPost,
  getFeed,
  getPost,
  deletePost,
  toggleReaction,
  addComment,
  getComments,
} from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All post routes require auth
router.post('/',                    requireAuth, createPost);
router.get('/feed',                 requireAuth, getFeed);
router.get('/:id',                  requireAuth, getPost);
router.delete('/:id',               requireAuth, deletePost);
router.post('/:id/react',           requireAuth, toggleReaction);
router.post('/:id/comments',        requireAuth, addComment);
router.get('/:id/comments',         requireAuth, getComments);

export default router;
