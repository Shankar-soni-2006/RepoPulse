import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics/analyticsService.js';
import { periodQuery } from '../schemas/common.js';
import { sendSuccess } from '../utils/response.js';
import type { TimePeriod } from '../types/index.js';

const days = (req: Request) => periodQuery.parse(req.query).days as TimePeriod;

// Full analytics: headline metrics, comparison, data quality and daily trends
export async function getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await analyticsService.getAnalytics(req.params.repositoryId, days(req)));
  } catch (err) {
    next(err);
  }
}

// Headline metrics with comparison only (no daily series)
export async function getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await analyticsService.getMetrics(req.params.repositoryId, days(req)));
  } catch (err) {
    next(err);
  }
}

export async function getContributors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await analyticsService.getContributorActivity(req.params.repositoryId, days(req)));
  } catch (err) {
    next(err);
  }
}
