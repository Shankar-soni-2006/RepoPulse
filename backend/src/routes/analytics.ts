import { Router } from 'express';
import { getAnalytics } from '../controllers/analyticsController';
import { validateParams } from '../middleware/validate';
import { repositoryIdParams } from '../schemas/common';

const router = Router({ mergeParams: true });

router.get('/', validateParams(repositoryIdParams), getAnalytics);

export default router;
