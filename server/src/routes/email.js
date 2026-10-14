import { Router } from 'express';
import { unsubscribeGet, unsubscribePost } from '../controllers/emailPrefsController.js';

const router = Router();

// No login needed — the token itself (an HMAC of userId:category) is the
// credential, matching every other one-click unsubscribe link.
router.get('/unsubscribe',  unsubscribeGet);
router.post('/unsubscribe', unsubscribePost);

export default router;
