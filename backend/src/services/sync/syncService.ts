import { subDays, subHours } from 'date-fns';
import { env } from '../../config/env';
import { repositoryRepository } from '../../repositories/repositoryRepository';
import { contributorRepository } from '../../repositories/contributorRepository';
import { pullRequestRepository } from '../../repositories/pullRequestRepository';
import { reviewRepository } from '../../repositories/reviewRepository';
import { commitRepository, type CommitInsert } from '../../repositories/commitRepository';
import type { Repository } from '../../types';
import { AppError, GitHubError } from '../../utils/errors';
import { mapWithConcurrency } from '../../utils/batch';
import { GitHubService, type GHPullRequest, type GHReview, type GHUser } from '../github/githubService';
import {
  normalizeCommit,
  normalizeContributorIdentity,
  normalizePullRequest,
  normalizeRepository,
  normalizeReview,
  summarizeReviews,
  type NormalizedReview,
} from '../github/normalizer';

// A 'syncing' claim older than this is treated as abandoned (e.g. server restart)
const STALE_SYNC_MINUTES = 30;
// Re-read a little before the last sync to absorb clock skew and in-flight updates
const INCREMENTAL_OVERLAP_HOURS = 1;
// Parallel GitHub requests per sync — low to stay clear of secondary rate limits
const GITHUB_CONCURRENCY = 4;
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
}

interface PullRequestWithReviews {
  pr: GHPullRequest;
  reviews: GHReview[];
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
    const owner = ghRepo.owner.login;
    const name = ghRepo.name;

    const since = repo.lastSyncedAt
      ? subHours(new Date(repo.lastSyncedAt), INCREMENTAL_OVERLAP_HOURS)
      : subDays(startedAt, env.SYNC_LOOKBACK_DAYS);

    // 2–4. Pull requests (with size details), their reviews, and commits
    const summaries = await github.listPullRequestsUpdatedSince(owner, name, since);
    const prs: PullRequestWithReviews[] = await mapWithConcurrency(
      summaries,
      GITHUB_CONCURRENCY,
      async (s) => ({
        pr: await github.getPullRequest(owner, name, s.number),
        reviews: await github.listReviews(owner, name, s.number),
      }),
    );
    const commits = await github.listCommits(owner, name, since);

    // 5. Contributor identities for everyone who appears in this batch
    const users = new Map<number, GHUser>();
    for (const { pr, reviews } of prs) {
      if (pr.user) users.set(pr.user.id, pr.user);
      for (const r of reviews) if (r.user) users.set(r.user.id, r.user);
    }
    for (const c of commits) if (c.author) users.set(c.author.id, c.author);

    await contributorRepository.upsertIdentities(
      [...users.values()].map((u) => normalizeContributorIdentity(u, repo.id)),
    );
    const contributorIds = await contributorRepository.findIdMap(repo.id);

    // 6–7. Normalize and upsert
    const prIds = await pullRequestRepository.upsertMany(
      prs.map(({ pr, reviews }) =>
        normalizePullRequest(pr, repo.id, contributorIds, summarizeReviews(reviews, pr.user?.id ?? null)),
      ),
    );

    const reviewRows = prs.flatMap(({ pr, reviews }) => {
      const pullRequestId = prIds.get(pr.id);
      if (!pullRequestId) throw new Error(`Pull request ${pr.id} was not stored`);
      return reviews
        .map((r) => normalizeReview(r, pullRequestId, repo.id, contributorIds))
        .filter((r): r is NormalizedReview => r !== null);
    });
    await reviewRepository.upsertMany(reviewRows);

    await commitRepository.insertNew(commits.map((c) => normalizeCommit(c, repo.id, contributorIds)));

    // Commit line stats: one request per commit, newest first, within the rate budget
    const budget = Math.min(
      MAX_COMMIT_STATS_PER_SYNC,
      (await github.getRemainingRequests()) - RATE_LIMIT_RESERVE,
    );
    const missing = await commitRepository.findMissingStats(repo.id, budget);
    const withStats = await mapWithConcurrency(missing, GITHUB_CONCURRENCY, async (row) => {
      try {
        return { ...row, ...statsOf(await github.getCommit(owner, name, row.sha)) };
      } catch (err) {
        // A commit rewritten out of history can vanish; leave its stats unknown
        if (err instanceof GitHubError && err.code === 'GITHUB_NOT_FOUND') return null;
        throw err;
      }
    });
    const fetched = withStats.filter((r): r is CommitInsert => r !== null && r.additions !== null);
    await commitRepository.saveStats(fetched);

    const summary: SyncSummary = {
      repositoryId: repo.id,
      since: since.toISOString(),
      pullRequests: prs.length,
      reviews: reviewRows.length,
      commits: commits.length,
      commitStatsFetched: fetched.length,
      commitStatsPending: await commitRepository.countMissingStats(repo.id),
    };

    // The next incremental sync starts from when this one started
    await repositoryRepository.markSyncSucceeded(repo.id, startedAt.toISOString());
    console.log(`[sync] ${ghRepo.full_name} done`, summary);
    return summary;
  } catch (err) {
    console.error(`[sync] ${repo.fullName} failed:`, err);
    await repositoryRepository
      .markSyncFailed(repo.id, failureMessage(err))
      .catch((markErr: Error) => console.error('[sync] could not record failure:', markErr.message));
    throw err;
  }
}

function statsOf(commit: { stats?: { additions?: number; deletions?: number }; parents: unknown[] }) {
  const known = commit.stats?.additions !== undefined && commit.stats?.deletions !== undefined;
  return {
    additions: known ? (commit.stats?.additions as number) : null,
    deletions: known ? (commit.stats?.deletions as number) : null,
    is_merge: commit.parents.length > 1,
  };
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
