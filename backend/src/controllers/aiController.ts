import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { aiService } from '../services/ai/aiService.js';
import { sendSuccess } from '../utils/response.js';
import { assertRepositoryAccess, getAuth } from '../middleware/auth.js';
import type { TimePeriod } from '../types/index.js';

const bodySchema = z
  .object({
    repositoryId: z.string().uuid(),
    days: z
      .number()
      .int()
      .refine((v) => v === 7 || v === 30 || v === 90, { message: 'days must be 7, 30, or 90' })
      .default(30),
    mode: z.enum(['summary', 'trends', 'anomalies', 'bottlenecks', 'comparison', 'question']),
    question: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.mode !== 'question' || (b.question && b.question.length > 0), {
    message: 'question is required when mode is "question"',
    path: ['question'],
  });

export async function getAIInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = bodySchema.parse(req.body);
    const { user } = getAuth(req);
    await assertRepositoryAccess(user.id, body.repositoryId);
    const result = await aiService.getInsights({
      userId: user.id,
      repositoryId: body.repositoryId,
      days: body.days as TimePeriod,
      mode: body.mode,
      question: body.question,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
