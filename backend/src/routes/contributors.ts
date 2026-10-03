import { Router } from 'express';
import { getContributors } from '../controllers/contributorController';

const router = Router({ mergeParams: true });

router.get('/', getContributors);

export default router;
