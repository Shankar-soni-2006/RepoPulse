import { Router } from 'express';
import { getAnalytics, getMetrics } from '../controllers/analyticsController.js';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { repositoryIdParams } from '../schemas/common.js';

// Mounted at /api/repositories/:repositoryId
const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/analytics', validateParams(repositoryIdParams), requireRepositoryAccess, getAnalytics);
router.get('/metrics', validateParams(repositoryIdParams), requireRepositoryAccess, getMetrics);

export default router;
