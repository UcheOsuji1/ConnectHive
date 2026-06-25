import { Router } from 'express';
import {
  getHives,
  getHive,
  createHive,
  saveDraft,
  matchHives,
  updateHive,
  joinHive,
  getMyHive,
  getHiveMessages,
} from '../controllers/hivesController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Matching & discovery (called by HiveDiscoveryPage)
router.post('/match', matchHives);

// Draft save (called by CreateHivePage "Save Draft")
router.post('/draft', requireAuth, saveDraft);

// My hive (must come before /:id to avoid conflict)
router.get('/my', requireAuth, getMyHive);

// Core CRUD
router.get('/',    getHives);
router.post('/',   requireAuth, createHive);
router.get('/:id', getHive);
router.put('/:id', requireAuth, updateHive);

// Member actions
router.post('/:id/join',    requireAuth, joinHive);
router.get('/:id/messages', requireAuth, getHiveMessages);

export default router;
