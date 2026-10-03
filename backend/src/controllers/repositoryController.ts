import { Request, Response, NextFunction } from 'express';
import { repositoryRepository } from '../repositories/repositoryRepository';
import { getAuth } from '../middleware/auth';
import { sessionService } from '../services/auth/sessionService';
import { discoverForUser } from '../services/github/discoveryService';
import { sendSuccess } from '../utils/response';
import { NotFoundError } from '../utils/errors';
import { syncService } from '../services/sync/syncService';

export async function listRepositories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const repos = await repositoryRepository.findAllForUser(getAuth(req).user.id);
    sendSuccess(res, repos);
  } catch (err) {
    next(err);
  }
}

// Re-reads the user's installations/repositories from GitHub (e.g. after installing the App)
export async function discoverRepositories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user, session } = getAuth(req);
    const accessToken = await sessionService.getAccessToken(session);
    sendSuccess(res, await discoverForUser(user.id, accessToken));
  } catch (err) {
    next(err);
  }
}

// Access already checked by requireRepositoryAccess
export async function getRepository(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const repo = await repositoryRepository.findById(req.params.repositoryId);
    if (!repo) throw new NotFoundError('Repository');
    sendSuccess(res, repo);
  } catch (err) {
    next(err);
  }
}

// Starts a background sync; clients poll the repository's syncStatus
export async function syncRepository(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const repo = await syncService.start(req.params.repositoryId);
    sendSuccess(res, repo, 202);
  } catch (err) {
    next(err);
  }
}
