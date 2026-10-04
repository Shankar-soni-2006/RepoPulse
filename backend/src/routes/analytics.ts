import { Router } from 'express';
import { getAnalytics } from '../controllers/analyticsController.js';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { repositoryIdParams } from '../schemas/common.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validateParams(repositoryIdParams), requireRepositoryAccess, getAnalytics);

export default router;
