import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { aiService } from '../services/ai/aiService';
import { sendSuccess } from '../utils/response';
import { ValidationError } from '../utils/errors';

const bodySchema = z.object({
  repositoryId: z.string().uuid(),
  period: z.object({
    from: z.string(),
    to: z.string(),
  }),
  question: z.string().max(500).optional(),
});

export async function getAIInsights(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const result = await aiService.getInsights(parsed.data);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
