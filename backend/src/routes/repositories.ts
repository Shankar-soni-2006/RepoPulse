import { Router } from 'express';
import {
  listRepositories,
  getRepository,
  syncRepository,
} from '../controllers/repositoryController';
import { validateParams } from '../middleware/validate';
import { repositoryIdParams } from '../schemas/common';

const router = Router();

router.get('/', listRepositories);
router.get('/:repositoryId', validateParams(repositoryIdParams), getRepository);
router.post('/:repositoryId/sync', validateParams(repositoryIdParams), syncRepository);

export default router;
