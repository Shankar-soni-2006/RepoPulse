import { Router } from 'express';
import { cacheService } from '../services/cache/cacheService.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// Liveness plus dependency status. The cache is optional: 'disabled' or 'error'
// means analytics are served from the database.
router.get('/', async (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    cache: await cacheService.status(),
  });
});

export default router;
