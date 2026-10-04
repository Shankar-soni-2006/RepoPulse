import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pullRequestRepository } from '../repositories/pullRequestRepository.js';
import { sendSuccess } from '../utils/response.js';
import { NotFoundError } from '../utils/errors.js';
import { assertRepositoryAccess, getAuth } from '../middleware/auth.js';

const querySchema = z.object({
  status: z.enum(['open', 'closed', 'merged']).optional(),
  search: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export async function getPullRequests(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = querySchema.parse(req.query);
    const result = await pullRequestRepository.findByRepository(
      req.params.repositoryId,
      query,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getPullRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const pr = await pullRequestRepository.findById(req.params.pullRequestId);
    if (!pr) throw new NotFoundError('Pull request');
    // Report a PR in an inaccessible repository as missing, not forbidden
    await assertRepositoryAccess(getAuth(req).user.id, pr.repositoryId).catch((err: unknown) => {
      throw err instanceof NotFoundError ? new NotFoundError('Pull request') : err;
    });
    sendSuccess(res, pr);
  } catch (err) {
    next(err);
  }
}
