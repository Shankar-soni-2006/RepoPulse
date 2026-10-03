import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { aiService } from '../services/ai/aiService';
import { sendSuccess } from '../utils/response';
import { assertRepositoryAccess, getAuth } from '../middleware/auth';

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
    const body = bodySchema.parse(req.body);
    await assertRepositoryAccess(getAuth(req).user.id, body.repositoryId);
    const result = await aiService.getInsights(body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
