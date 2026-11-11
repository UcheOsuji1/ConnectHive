import { Router } from 'express';
import { createBlock, removeBlock, listBlocks } from '../controllers/blocksController.js';
import { requireAuth } from '../middleware/auth.js';
import { isUuid } from '../lib/isUuid.js';

const router = Router();

router.param('userId', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Member not found.' });
  next();
});

router.get('/',            requireAuth, listBlocks);
router.post('/:userId',    requireAuth, createBlock);
router.delete('/:userId',  requireAuth, removeBlock);

export default router;
