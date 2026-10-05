import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCategoryConfig } from '../controllers/categoriesController.js';

const router = Router();

router.get('/config', requireAuth, getCategoryConfig);

export default router;
