import { Router } from 'express';
import {
  getHives,
  getHive,
  createHive,
  updateHive,
  joinHive,
  getMyHive,
  getHiveMessages,
} from '../controllers/hivesController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', getHives);
router.get('/my', authenticate, getMyHive);
router.get('/:id', getHive);
router.post('/', authenticate, createHive);
router.put('/:id', authenticate, updateHive);
router.post('/:id/join', authenticate, joinHive);
router.get('/:id/messages', authenticate, getHiveMessages);

export default router;
