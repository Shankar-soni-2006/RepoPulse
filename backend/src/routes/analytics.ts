import { Router } from 'express';
import { getAnalytics } from '../controllers/analyticsController';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { repositoryIdParams } from '../schemas/common';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validateParams(repositoryIdParams), requireRepositoryAccess, getAnalytics);

export default router;
