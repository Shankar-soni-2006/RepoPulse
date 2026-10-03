import { Router } from 'express';
import { getContributors } from '../controllers/contributorController';
import { validateParams } from '../middleware/validate';
import { repositoryIdParams } from '../schemas/common';

const router = Router({ mergeParams: true });

router.get('/', validateParams(repositoryIdParams), getContributors);

export default router;
