import { z } from 'zod';

// Only the fields RepoPulse reads; everything else passes through untouched and
// is kept in webhook_events.payload.

const repository = z
  .object({
    id: z.number(),
    name: z.string(),
    owner: z.object({ login: z.string() }).passthrough(),
  })
  .passthrough();

export const basePayload = z.object({ repository: repository.optional() }).passthrough();

const pullRequestRef = z.object({ number: z.number(), created_at: z.string() }).passthrough();

export const pullRequestPayload = z
  .object({ action: z.string(), repository, pull_request: pullRequestRef })
  .passthrough();

export const pullRequestReviewPayload = z
  .object({ action: z.string(), repository, pull_request: pullRequestRef })
  .passthrough();

export const pushPayload = z
  .object({
    ref: z.string(),
    before: z.string(),
    after: z.string(),
    created: z.boolean().optional(),
    deleted: z.boolean().optional(),
    repository,
  })
  .passthrough();

export type RepositoryRef = z.infer<typeof repository>;

/** Events RepoPulse processes; anything else is recorded and ignored. */
export const HANDLED_EVENTS = new Set(['pull_request', 'pull_request_review', 'push']);

// "before" of a push that created the branch
export const NULL_SHA = /^0{40}$/;
