import { env } from '../config/env.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { webhookEventRepository } from '../repositories/webhookEventRepository.js';
import type { Repository, WebhookEvent } from '../types/index.js';
import { AppError } from '../utils/errors.js';
import { analyticsService } from '../services/analytics/analyticsService.js';
import { cacheService } from '../services/cache/cacheService.js';
import { GitHubService } from '../services/github/githubService.js';
import { backfillCommitStats, fetchPullRequests, storeActivity } from '../services/sync/ingest.js';
import {
  basePayload,
  HANDLED_EVENTS,
  NULL_SHA,
  pullRequestPayload,
  pullRequestReviewPayload,
  pushPayload,
  type RepositoryRef,
} from './payloads.js';
import { verifySignature } from './signature.js';

// Upper bound on per-commit stat requests for one push; the next sync fills the rest
const MAX_PUSH_COMMIT_STATS = 100;

export interface IncomingWebhook {
  event: string | undefined;
  deliveryId: string | undefined;
  signature: string | undefined;
  contentType: string | undefined;
  rawBody: Buffer;
}

export interface ReceiveResult {
  deliveryId: string;
  status: 'accepted' | 'duplicate';
  /** Set when accepted: the recorded event, to be processed after responding */
  event?: WebhookEvent;
}

/** Thrown by handlers for events that are valid but need no work. Recorded as 'ignored'. */
class Ignored extends Error {}

/**
 * Validates and records a delivery. Rejects anything that isn't a correctly signed
 * JSON payload from GitHub. Duplicate deliveries are acknowledged without reprocessing.
 */
async function receive(hook: IncomingWebhook): Promise<ReceiveResult> {
  if (!hook.event || !hook.deliveryId) {
    throw new AppError('WEBHOOK_HEADERS_MISSING', 'Missing X-GitHub-Event or X-GitHub-Delivery header', 400);
  }
  if (!hook.contentType?.startsWith('application/json')) {
    throw new AppError(
      'WEBHOOK_CONTENT_TYPE',
      'Set the GitHub App webhook content type to application/json',
      415,
    );
  }
  if (!verifySignature(env.GITHUB_WEBHOOK_SECRET, hook.rawBody, hook.signature)) {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed', 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(hook.rawBody.toString('utf8'));
  } catch {
    throw new AppError('INVALID_JSON', 'Webhook body is not valid JSON', 400);
  }
  const base = basePayload.safeParse(payload);
  if (!base.success) throw new AppError('WEBHOOK_PAYLOAD_INVALID', 'Unexpected webhook payload', 400);

  const repo = base.data.repository
    ? await repositoryRepository.findByGithubId(base.data.repository.id)
    : null;

  const event = await webhookEventRepository.create({
    repository_id: repo?.id ?? null,
    event_type: hook.event,
    action: typeof base.data.action === 'string' ? base.data.action : null,
    github_delivery_id: hook.deliveryId,
    payload: base.data,
  });
  if (!event) return { deliveryId: hook.deliveryId, status: 'duplicate' };
  return { deliveryId: hook.deliveryId, status: 'accepted', event };
}

/** Updates the one PR (details + reviews) named by a pull_request / pull_request_review event. */
async function handlePullRequest(repo: Repository, github: GitHubService, ref: RepositoryRef, number: number) {
  const prs = await fetchPullRequests(github, { owner: ref.owner.login, name: ref.name }, [number]);
  await storeActivity(repo.id, prs, []);
  return prs[0]?.pr.created_at;
}

/** Stores the commits a push added to the default branch. */
async function handlePush(repo: Repository, github: GitHubService, payload: unknown) {
  const push = pushPayload.parse(payload);
  if (push.ref !== `refs/heads/${repo.defaultBranch}`) throw new Ignored(`Push to ${push.ref}, not the default branch`);
  if (push.deleted) throw new Ignored('Branch deletion');
  if (NULL_SHA.test(push.before)) throw new Ignored('Branch creation; the next sync imports its history');

  const ref = { owner: push.repository.owner.login, name: push.repository.name };
  const commits = await github.compareCommits(ref.owner, ref.name, push.before, push.after);
  if (commits.length === 0) throw new Ignored('Push contained no new commits');

  await storeActivity(repo.id, [], commits);
  await backfillCommitStats(github, repo.id, ref, Math.min(commits.length, MAX_PUSH_COMMIT_STATS));

  const dates = commits
    .map((c) => c.commit.author?.date ?? c.commit.committer?.date)
    .filter((d): d is string => !!d)
    .sort();
  return dates[0];
}

/**
 * Applies one recorded event: updates only the affected PR or commits, then
 * recomputes daily metrics from the earliest affected day. Never runs a full sync.
 * The outcome (processed / ignored / failed) is recorded on the event.
 */
async function process(event: WebhookEvent, now = new Date()): Promise<WebhookEvent['status']> {
  try {
    await webhookEventRepository.markProcessing(event.id);

    if (!HANDLED_EVENTS.has(event.eventType)) throw new Ignored(`Event type '${event.eventType}' is not used`);
    if (!event.repositoryId) throw new Ignored('Repository is not tracked by RepoPulse');

    const repo = await repositoryRepository.findById(event.repositoryId);
    if (!repo) throw new Ignored('Repository is not tracked by RepoPulse');
    if (!repo.lastSyncedAt || !repo.dataSince) {
      throw new Ignored('Repository has not been synced yet; the first sync imports this activity');
    }
    const installationId = await repositoryRepository.findInstallationGithubId(repo.id);
    if (installationId === null) throw new Ignored('Repository is no longer shared with the GitHub App');
    const github = new GitHubService(installationId);

    let affectedFrom: string | undefined;
    if (event.eventType === 'push') {
      affectedFrom = await handlePush(repo, github, event.payload);
    } else {
      const parsed = (event.eventType === 'pull_request' ? pullRequestPayload : pullRequestReviewPayload).parse(
        event.payload,
      );
      affectedFrom = await handlePullRequest(repo, github, parsed.repository, parsed.pull_request.number);
    }

    // Recompute from the earliest affected day (never before the start of synced data)
    const from =
      affectedFrom && Date.parse(affectedFrom) > Date.parse(repo.dataSince) ? affectedFrom : repo.dataSince;
    await analyticsService.refreshDailyMetrics(repo.id, from, now);
    await cacheService.invalidateRepository(repo.id);

    await webhookEventRepository.markProcessed(event.id);
    return 'processed';
  } catch (err) {
    if (err instanceof Ignored) {
      await webhookEventRepository.markIgnored(event.id, err.message);
      return 'ignored';
    }
    console.error(`[webhook] ${event.eventType} ${event.githubDeliveryId} failed:`, err);
    const message = err instanceof AppError ? err.message : 'Processing failed due to an internal error';
    await webhookEventRepository
      .markFailed(event.id, message)
      .catch((markErr: Error) => console.error('[webhook] could not record failure:', markErr.message));
    // Part of the update may have been written before the failure
    if (event.repositoryId) await cacheService.invalidateRepository(event.repositoryId);
    return 'failed';
  }
}

export const webhookService = { receive, process };
