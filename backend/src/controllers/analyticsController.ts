import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { analyticsService } from '../services/analytics/analyticsService';
import { sendSuccess } from '../utils/response';
import { ValidationError } from '../utils/errors';

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
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const result = await analyticsService.getAnalytics(
      req.params.repositoryId,
      parsed.data.days as 7 | 30 | 90,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
