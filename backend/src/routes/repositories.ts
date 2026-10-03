import { Router } from 'express';
import {
  listRepositories,
  getRepository,
  syncRepository,
} from '../controllers/repositoryController';

const router = Router();

router.get('/', listRepositories);
router.get('/:repositoryId', getRepository);
router.post('/:repositoryId/sync', syncRepository);

export default router;
