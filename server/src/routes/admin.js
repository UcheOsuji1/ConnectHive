import { Router } from 'express';
import { getAdminReports, resolveAdminReport, unsuspendUser, getSuspendedUsers } from '../controllers/adminController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSiteAdmin } from '../lib/siteAdmin.js';

const router = Router();

// Every route here is gated by requireSiteAdmin, which 404s for anyone not
// on SITE_ADMIN_EMAILS — the admin area must not confirm its own existence
// to someone who isn't on the list.
router.use(requireAuth, requireSiteAdmin);

router.get('/reports',                              getAdminReports);
router.post('/reports/:targetType/:targetId/resolve', resolveAdminReport);
router.post('/users/:id/unsuspend',                  unsuspendUser);
router.get('/suspended',                             getSuspendedUsers);

export default router;
