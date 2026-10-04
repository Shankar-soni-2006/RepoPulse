import { Router } from 'express';
import { getContributors } from '../controllers/contributorController.js';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { repositoryIdParams } from '../schemas/common.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validateParams(repositoryIdParams), requireRepositoryAccess, getContributors);

export default router;
