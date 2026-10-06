import { Request, Response, NextFunction } from 'express';
import { teamService } from '../services/team/teamService.js';
import { getAuth } from '../middleware/auth.js';
import { periodQuery } from '../schemas/common.js';
import type { TimePeriod } from '../types/index.js';
import { sendSuccess } from '../utils/response.js';

export async function listTeamAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await teamService.listAccounts(getAuth(req).user.id));
  } catch (err) {
    next(err);
  }
}

export async function getTeamOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = periodQuery.parse(req.query).days as TimePeriod;
    sendSuccess(res, await teamService.getOverview(getAuth(req).user.id, req.params.accountId, days));
  } catch (err) {
    next(err);
  }
}
