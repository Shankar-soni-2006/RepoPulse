import { Router } from 'express';
import { sendSuccess } from '../utils/response';

const router = Router();

router.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

export default router;
