import { Router } from 'express';
import {
  listRepositories,
  discoverRepositories,
  getRepository,
  syncRepository,
} from '../controllers/repositoryController';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { repositoryIdParams } from '../schemas/common';

const router = Router();

router.use(requireAuth);

router.get('/', listRepositories);
router.post('/discover', discoverRepositories);
router.get('/:repositoryId', validateParams(repositoryIdParams), requireRepositoryAccess, getRepository);
router.post('/:repositoryId/sync', validateParams(repositoryIdParams), requireRepositoryAccess, syncRepository);

export default router;
