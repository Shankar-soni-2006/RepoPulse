import { Request, Response, NextFunction } from 'express';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { getAuth } from '../middleware/auth.js';
import { sessionService } from '../services/auth/sessionService.js';
import { discoverForUser } from '../services/github/discoveryService.js';
import { sendSuccess } from '../utils/response.js';
import { NotFoundError } from '../utils/errors.js';
import { webhookEventRepository } from '../repositories/webhookEventRepository.js';
import { z } from 'zod';
import { syncService } from '../services/sync/syncService.js';

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

const webhookEventsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

// Recent webhook deliveries for the repository (status only, no payloads)
export async function listWebhookEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit } = webhookEventsQuery.parse(req.query);
    sendSuccess(res, await webhookEventRepository.findRecentForRepository(req.params.repositoryId, limit));
  } catch (err) {
    next(err);
  }
}
