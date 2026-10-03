import { z } from 'zod';

// Route parameter schemas shared across routers

export const repositoryIdParams = z.object({
  repositoryId: z.string().uuid('repositoryId must be a valid UUID'),
});

export const pullRequestIdParams = z.object({
  pullRequestId: z.string().uuid('pullRequestId must be a valid UUID'),
});
