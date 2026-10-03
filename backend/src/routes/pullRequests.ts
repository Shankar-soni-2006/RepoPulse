import { Router } from 'express';
import { getPullRequests, getPullRequest } from '../controllers/pullRequestController';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { pullRequestIdParams, repositoryIdParams } from '../schemas/common';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validateParams(repositoryIdParams), requireRepositoryAccess, getPullRequests);

export default router;

// Standalone PR detail route (mounted at /api/pull-requests)
export const pullRequestDetailRouter = Router();
pullRequestDetailRouter.use(requireAuth);
pullRequestDetailRouter.get('/:pullRequestId', validateParams(pullRequestIdParams), getPullRequest);
