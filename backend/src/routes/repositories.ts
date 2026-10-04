import { Router } from 'express';
import {
  listRepositories,
  discoverRepositories,
  getRepository,
  syncRepository,
} from '../controllers/repositoryController.js';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { repositoryIdParams } from '../schemas/common.js';

const router = Router();

router.use(requireAuth);

router.get('/', listRepositories);
router.post('/discover', discoverRepositories);
router.get('/:repositoryId', validateParams(repositoryIdParams), requireRepositoryAccess, getRepository);
router.post('/:repositoryId/sync', validateParams(repositoryIdParams), requireRepositoryAccess, syncRepository);

export default router;
