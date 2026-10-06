import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { getTeamOverview, listTeamAccounts } from '../controllers/teamController.js';

// Team view: an account's repositories combined. Any signed-in user; the service limits
// results to repositories the user can access on GitHub.
const router = Router();
const accountParams = z.object({ accountId: z.string().uuid('accountId must be a valid UUID') });

router.use(requireAuth);
router.get('/accounts', listTeamAccounts);
router.get('/accounts/:accountId', validateParams(accountParams), getTeamOverview);

export default router;
