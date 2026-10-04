import { Router } from 'express';
import { getPullRequests, getPullRequest } from '../controllers/pullRequestController.js';
import { requireAuth, requireRepositoryAccess } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { pullRequestIdParams, repositoryIdParams } from '../schemas/common.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validateParams(repositoryIdParams), requireRepositoryAccess, getPullRequests);

export default router;

// Standalone PR detail route (mounted at /api/pull-requests)
export const pullRequestDetailRouter = Router();
pullRequestDetailRouter.use(requireAuth);
pullRequestDetailRouter.get('/:pullRequestId', validateParams(pullRequestIdParams), getPullRequest);
