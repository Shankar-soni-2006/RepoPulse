import { Router } from 'express';
import { getPullRequests, getPullRequest } from '../controllers/pullRequestController';

const router = Router({ mergeParams: true });

router.get('/', getPullRequests);

export default router;

// Standalone PR detail route (mounted at /api/pull-requests)
export const pullRequestDetailRouter = Router();
pullRequestDetailRouter.get('/:pullRequestId', getPullRequest);
