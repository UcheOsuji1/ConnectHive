import { Router } from 'express';
import { getToolCatalog } from '../controllers/toolsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/catalog', requireAuth, getToolCatalog);

export default router;
