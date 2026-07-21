import { Router } from 'express';
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
} from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Static sub-paths must precede /:id
router.post('/',                       requireAuth, createPost);
router.get('/feed',                    requireAuth, getFeed);
router.delete('/comments/:commentId',  requireAuth, deleteComment);

// Single post
router.get('/:id',                     requireAuth, getPost);
router.delete('/:id',                  requireAuth, deletePost);

// Post actions
router.post('/:id/react',              requireAuth, toggleReaction);
router.get('/:id/reactors',            requireAuth, getReactors);
router.post('/:id/comments',           requireAuth, addComment);
router.get('/:id/comments',            requireAuth, getComments);

export default router;
