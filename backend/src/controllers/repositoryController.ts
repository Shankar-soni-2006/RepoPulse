import { Request, Response, NextFunction } from 'express';
import { repositoryRepository } from '../repositories/repositoryRepository';
import { syncRepository as runSync } from '../services/sync/syncService';
import { sendSuccess } from '../utils/response';
import { NotFoundError } from '../utils/errors';

export async function listRepositories(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const repos = await repositoryRepository.findAll();
    sendSuccess(res, repos);
  } catch (err) {
    next(err);
  }
}

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

export async function syncRepository(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const repo = await repositoryRepository.findById(req.params.repositoryId);
    if (!repo) throw new NotFoundError('Repository');

    // Run sync in background — respond immediately
    runSync(repo).catch((err) =>
      console.error(`Sync failed for ${repo.fullName}:`, err),
    );

    sendSuccess(res, { message: `Sync started for ${repo.fullName}` });
  } catch (err) {
    next(err);
  }
}
