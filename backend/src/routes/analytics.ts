import { Router } from 'express';
import { getAnalytics } from '../controllers/analyticsController';

const router = Router({ mergeParams: true });

router.get('/', getAnalytics);

export default router;
