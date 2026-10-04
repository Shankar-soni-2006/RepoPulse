import { Router } from 'express';
import { getAIInsights } from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/insights', requireAuth, getAIInsights);

export default router;
