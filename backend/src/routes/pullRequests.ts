import { Router } from 'express';
import { getPullRequests, getPullRequest } from '../controllers/pullRequestController';
import { validateParams } from '../middleware/validate';
import { pullRequestIdParams, repositoryIdParams } from '../schemas/common';

const router = Router({ mergeParams: true });

router.get('/', validateParams(repositoryIdParams), getPullRequests);

export default router;

// Standalone PR detail route (mounted at /api/pull-requests)
export const pullRequestDetailRouter = Router();
pullRequestDetailRouter.get('/:pullRequestId', validateParams(pullRequestIdParams), getPullRequest);
