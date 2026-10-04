import { contributorRepository } from '../../repositories/contributorRepository.js';
import { pullRequestRepository } from '../../repositories/pullRequestRepository.js';
import { reviewRepository } from '../../repositories/reviewRepository.js';
import { commitRepository, type CommitInsert } from '../../repositories/commitRepository.js';
import { GitHubError } from '../../utils/errors.js';
import { mapWithConcurrency } from '../../utils/batch.js';
import type { GitHubService, GHCommit, GHPullRequest, GHReview, GHUser } from '../github/githubService.js';
import {
  normalizeCommit,
  normalizeContributorIdentity,
  normalizePullRequest,
  normalizeReview,
  summarizeReviews,
  type NormalizedReview,
} from '../github/normalizer.js';

// Shared by full syncs and webhook updates, so both paths store data identically.
// Every write is idempotent on GitHub identity.

// Parallel GitHub requests — low to stay clear of secondary rate limits
export const GITHUB_CONCURRENCY = 4;

export interface PullRequestWithReviews {
  pr: GHPullRequest;
  reviews: GHReview[];
}

export interface RepoRef {
  owner: string;
  name: string;
}

/** Each PR's full details (sizes) and all its reviews. */
export function fetchPullRequests(
  github: GitHubService,
  { owner, name }: RepoRef,
  numbers: number[],
): Promise<PullRequestWithReviews[]> {
  return mapWithConcurrency(numbers, GITHUB_CONCURRENCY, async (n) => ({
    pr: await github.getPullRequest(owner, name, n),
    reviews: await github.listReviews(owner, name, n),
  }));
}

/**
 * Upserts contributor identities for everyone involved, then PRs (with review
 * summaries), their reviews, and commits not stored before.
 */
export async function storeActivity(
  repositoryId: string,
  prs: PullRequestWithReviews[],
  commits: GHCommit[],
): Promise<{ reviews: number }> {
  const users = new Map<number, GHUser>();
  for (const { pr, reviews } of prs) {
    if (pr.user) users.set(pr.user.id, pr.user);
    for (const r of reviews) if (r.user) users.set(r.user.id, r.user);
  }
  for (const c of commits) if (c.author) users.set(c.author.id, c.author);

  await contributorRepository.upsertIdentities(
    [...users.values()].map((u) => normalizeContributorIdentity(u, repositoryId)),
  );
  const contributorIds = await contributorRepository.findIdMap(repositoryId);

  const prIds = await pullRequestRepository.upsertMany(
    prs.map(({ pr, reviews }) =>
      normalizePullRequest(pr, repositoryId, contributorIds, summarizeReviews(reviews, pr.user?.id ?? null)),
    ),
  );

  const reviewRows = prs.flatMap(({ pr, reviews }) => {
    const pullRequestId = prIds.get(pr.id);
    if (!pullRequestId) throw new Error(`Pull request ${pr.id} was not stored`);
    return reviews
      .map((r) => normalizeReview(r, pullRequestId, repositoryId, contributorIds))
      .filter((r): r is NormalizedReview => r !== null);
  });
  await reviewRepository.upsertMany(reviewRows);

  await commitRepository.insertNew(commits.map((c) => normalizeCommit(c, repositoryId, contributorIds)));

  return { reviews: reviewRows.length };
}

function statsOf(commit: { stats?: { additions?: number; deletions?: number }; parents: unknown[] }) {
  const known = commit.stats?.additions !== undefined && commit.stats?.deletions !== undefined;
  return {
    additions: known ? (commit.stats?.additions as number) : null,
    deletions: known ? (commit.stats?.deletions as number) : null,
    is_merge: commit.parents.length > 1,
  };
}

/**
 * Fetches line stats for up to `limit` commits still missing them (newest first).
 * One request per commit. Returns how many were filled in.
 */
export async function backfillCommitStats(
  github: GitHubService,
  repositoryId: string,
  { owner, name }: RepoRef,
  limit: number,
): Promise<number> {
  const missing = await commitRepository.findMissingStats(repositoryId, limit);
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
  return fetched.length;
}
