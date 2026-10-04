import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics/analyticsService.js';
import { cacheKeys, cacheService } from '../services/cache/cacheService.js';
import { periodQuery } from '../schemas/common.js';
import { sendSuccess } from '../utils/response.js';
import type { TimePeriod } from '../types/index.js';

// Access is checked by route middleware before any cache read, so a cached entry is
// only ever served to users allowed to see that repository.

const days = (req: Request) => periodQuery.parse(req.query).days as TimePeriod;

function cached<T>(
  key: (repositoryId: string, days: TimePeriod) => string,
  load: (repositoryId: string, days: TimePeriod) => Promise<T>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repositoryId = req.params.repositoryId;
      const period = days(req);
      const { value, cache } = await cacheService.getOrLoad(key(repositoryId, period), () =>
        load(repositoryId, period),
      );
      res.set('X-Cache', cache);
      sendSuccess(res, value);
    } catch (err) {
      next(err);
    }
  };
}

// Full analytics: headline metrics, comparison, data quality and daily trends
export const getAnalytics = cached(cacheKeys.analytics, (id, d) => analyticsService.getAnalytics(id, d));

// Headline metrics with comparison only (no daily series)
export const getMetrics = cached(cacheKeys.overview, (id, d) => analyticsService.getMetrics(id, d));

export const getContributors = cached(cacheKeys.contributors, (id, d) =>
  analyticsService.getContributorActivity(id, d),
);
