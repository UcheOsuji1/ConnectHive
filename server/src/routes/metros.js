import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMetros, getMetroPlaces } from '../controllers/metrosController.js';

const router = Router();

router.get('/',       requireAuth, getMetros);
router.get('/places', requireAuth, getMetroPlaces);

export default router;
