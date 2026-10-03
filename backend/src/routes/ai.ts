import { Router } from 'express';
import { getAIInsights } from '../controllers/aiController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/insights', requireAuth, getAIInsights);

export default router;
