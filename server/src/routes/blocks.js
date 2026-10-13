import { Router } from 'express';
import { createBlock, removeBlock, listBlocks } from '../controllers/blocksController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/',            requireAuth, listBlocks);
router.post('/:userId',    requireAuth, createBlock);
router.delete('/:userId',  requireAuth, removeBlock);

export default router;
