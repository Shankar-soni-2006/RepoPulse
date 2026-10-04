import { subDays, subHours } from 'date-fns';
import { env } from '../../config/env.js';
import { repositoryRepository } from '../../repositories/repositoryRepository.js';
import { commitRepository } from '../../repositories/commitRepository.js';
import type { Repository } from '../../types/index.js';
import { AppError } from '../../utils/errors.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { cacheService } from '../cache/cacheService.js';
import { GitHubService } from '../github/githubService.js';
import { normalizeRepository } from '../github/normalizer.js';
import { backfillCommitStats, fetchPullRequests, storeActivity } from './ingest.js';

// A 'syncing' claim older than this is treated as abandoned (e.g. server restart)
const STALE_SYNC_MINUTES = 30;
// Re-read a little before the last sync to absorb clock skew and in-flight updates
const INCREMENTAL_OVERLAP_HOURS = 1;
// Commit stats cost one request each: cap per sync and keep a rate-limit reserve
const MAX_COMMIT_STATS_PER_SYNC = 1000;
const RATE_LIMIT_RESERVE = 300;

export interface SyncSummary {
  repositoryId: string;
  since: string;
  pullRequests: number;
  reviews: number;
  commits: number;
  commitStatsFetched: number;
  /** Commits whose line stats are still unknown; later syncs continue the backfill */
  commitStatsPending: number;
  /** Daily metric rows recomputed after the sync */
  dailyMetricsRefreshed: number;
}

function failureMessage(err: unknown): string {
  // AppError messages are written for users; anything else may expose internals
  return err instanceof AppError ? err.message : 'Sync failed due to an internal error';
}

/**
 * Fetches GitHub activity for one repository and upserts it. Every write is
 * idempotent on GitHub identity, so a failed or repeated sync is safe to re-run.
 * Expects the repository to be claimed (sync_status = 'syncing').
 */
async function runSync(repo: Repository): Promise<SyncSummary> {
  const startedAt = new Date();

  try {
    const installationId = await repositoryRepository.findInstallationGithubId(repo.id);
    if (installationId === null) {
      throw new AppError(
        'INSTALLATION_MISSING',
        'This repository is no longer shared with the RepoPulse GitHub App',
        409,
      );
    }
    const github = new GitHubService(installationId);

    // 1. Repository metadata (by id, so renames/transfers are picked up)
    const ghRepo = await github.getRepositoryById(repo.githubId);
    await repositoryRepository.update(repo.id, normalizeRepository(ghRepo));
    const ref = { owner: ghRepo.owner.login, name: ghRepo.name };

    // Incremental only when we know where the synced data starts; otherwise (first sync,
    // or synced before data_since was tracked) read the full lookback window.
    const since =
      repo.lastSyncedAt && repo.dataSince
        ? subHours(new Date(repo.lastSyncedAt), INCREMENTAL_OVERLAP_HOURS)
        : subDays(startedAt, env.SYNC_LOOKBACK_DAYS);

    // 2–4. Pull requests (with size details), their reviews, and commits
    const summaries = await github.listPullRequestsUpdatedSince(ref.owner, ref.name, since);
    const prs = await fetchPullRequests(github, ref, summaries.map((s) => s.number));
    const commits = await github.listCommits(ref.owner, ref.name, since);

    // 5–7. Contributors, PRs, reviews and new commits
    const { reviews } = await storeActivity(repo.id, prs, commits);

    // Commit line stats: one request per commit, newest first, within the rate budget
    const budget = Math.min(
      MAX_COMMIT_STATS_PER_SYNC,
      (await github.getRemainingRequests()) - RATE_LIMIT_RESERVE,
    );
    const commitStatsFetched = await backfillCommitStats(github, repo.id, ref, budget);

    // Earliest point covered by synced data (only ever moves back in time)
    const dataSince =
      repo.dataSince && Date.parse(repo.dataSince) < since.getTime() ? repo.dataSince : since.toISOString();

    // 8–9. Recompute daily metrics over everything synced so far
    const dailyMetricsRefreshed = await analyticsService.refreshDailyMetrics(repo.id, dataSince, startedAt);

    const summary: SyncSummary = {
      repositoryId: repo.id,
      since: since.toISOString(),
      pullRequests: prs.length,
      reviews,
      commits: commits.length,
      commitStatsFetched,
      commitStatsPending: await commitRepository.countMissingStats(repo.id),
      dailyMetricsRefreshed,
    };

    // The next incremental sync starts from when this one started
    await repositoryRepository.markSyncSucceeded(repo.id, startedAt.toISOString(), dataSince);
    await cacheService.invalidateRepository(repo.id);
    console.log(`[sync] ${ghRepo.full_name} done`, summary);
    return summary;
  } catch (err) {
    console.error(`[sync] ${repo.fullName} failed:`, err);
    await repositoryRepository
      .markSyncFailed(repo.id, failureMessage(err))
      .catch((markErr: Error) => console.error('[sync] could not record failure:', markErr.message));
    // Part of the data may have been written before the failure
    await cacheService.invalidateRepository(repo.id);
    throw err;
  }
}

async function claim(repositoryId: string): Promise<Repository> {
  const claimed = await repositoryRepository.claimForSync(repositoryId, STALE_SYNC_MINUTES);
  if (!claimed) {
    throw new AppError('SYNC_IN_PROGRESS', 'A sync is already running for this repository', 409);
  }
  return claimed;
}

export const syncService = {
  /**
   * Claims the repository and runs the sync in the background.
   * Resolves with the repository in 'syncing' state; clients poll its status.
   */
  async start(repositoryId: string): Promise<Repository> {
    const repo = await claim(repositoryId);
    runSync(repo).catch(() => {
      // Already logged and recorded on the repository by runSync
    });
    return repo;
  },

  /** Claims and syncs, waiting for completion (CLI / scripts). */
  async runNow(repositoryId: string): Promise<SyncSummary> {
    return runSync(await claim(repositoryId));
  },
};
