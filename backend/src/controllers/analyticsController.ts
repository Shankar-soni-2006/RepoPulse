import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { analyticsService } from '../services/analytics/analyticsService.js';
import { sendSuccess } from '../utils/response.js';

const querySchema = z.object({
  days: z.coerce.number().int().refine((v) => [7, 30, 90].includes(v), {
    message: 'days must be 7, 30, or 90',
  }).default(30),
});

export async function getAnalytics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = querySchema.parse(req.query);
    const result = await analyticsService.getAnalytics(
      req.params.repositoryId,
      query.days as 7 | 30 | 90,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
