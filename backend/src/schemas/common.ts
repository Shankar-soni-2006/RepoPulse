import { z } from 'zod';

// Route parameter schemas shared across routers

export const repositoryIdParams = z.object({
  repositoryId: z.string().uuid('repositoryId must be a valid UUID'),
});

export const pullRequestIdParams = z.object({
  pullRequestId: z.string().uuid('pullRequestId must be a valid UUID'),
});

// ?days=7|30|90 (default 30)
export const periodQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v): v is 7 | 30 | 90 => v === 7 || v === 30 || v === 90, {
      message: 'days must be 7, 30, or 90',
    })
    .default(30),
});
