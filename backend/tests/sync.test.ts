import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { GitHubService } from '../src/services/github/githubService.js';
import type { GHCommit, GHPullRequest, GHRepository, GHReview } from '../src/services/github/githubService.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { contributorRepository } from '../src/repositories/contributorRepository.js';
import { pullRequestRepository } from '../src/repositories/pullRequestRepository.js';
import { reviewRepository } from '../src/repositories/reviewRepository.js';
import { commitRepository, type CommitInsert } from '../src/repositories/commitRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import { analyticsRepository } from '../src/repositories/analyticsRepository.js';
import { syncService } from '../src/services/sync/syncService.js';
import { GitHubError } from '../src/utils/errors.js';
import type { Repository } from '../src/types/index.js';
import { authHeaders, REPO_ID, testSession, testUser } from './helpers.js';

vi.mock('../src/services/github/githubService.js');
vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/contributorRepository.js');
vi.mock('../src/repositories/pullRequestRepository.js');
vi.mock('../src/repositories/reviewRepository.js');
vi.mock('../src/repositories/commitRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');
vi.mock('../src/repositories/analyticsRepository.js');

const NOW = new Date('2026-10-03T12:00:00Z');

const ghRepo: GHRepository = {
  id: 555,
  name: 'api-renamed',
  full_name: 'acme/api-renamed',
  owner: { login: 'acme' },
  description: null,
  private: true,
  default_branch: 'main',
  language: 'TypeScript',
  html_url: 'https://github.com/acme/api-renamed',
  fork: false,
  archived: true,
  stargazers_count: 0,
  forks_count: 0,
  open_issues_count: 0,
};

const author = { id: 1, login: 'author' };
const reviewer = { id: 2, login: 'reviewer' };
const committer = { id: 3, login: 'committer' };

const pr: GHPullRequest = {
  id: 9001,
  number: 12,
  title: 'Add cache',
  body: null,
  user: author,
  state: 'closed',
  labels: [],
  additions: 30,
  deletions: 5,
  changed_files: 3,
  created_at: '2026-09-30T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  merged_at: '2026-10-01T08:00:00Z',
  closed_at: '2026-10-01T08:00:00Z',
};

const reviews: GHReview[] = [
  { id: 71, user: author, state: 'COMMENTED', submitted_at: '2026-09-30T09:00:00Z' },
  { id: 72, user: reviewer, state: 'APPROVED', submitted_at: '2026-09-30T12:00:00Z' },
];

const commits: GHCommit[] = [
  {
    sha: 'c1',
    author: committer,
    commit: { author: { date: '2026-10-01T07:00:00Z' }, committer: null, message: 'feat: cache' },
    parents: [{ sha: 'p' }],
  },
];

function repoRow(overrides: Partial<Repository> = {}): Repository {
  return {
    id: REPO_ID,
    githubId: 555,
    name: 'api',
    fullName: 'acme/api',
    owner: 'acme',
    description: null,
    visibility: 'private',
    defaultBranch: 'main',
    language: null,
    htmlUrl: null,
    isFork: false,
    isArchived: false,
    stargazersCount: 0,
    forksCount: 0,
    openIssuesCount: 0,
    syncStatus: 'syncing',
    syncError: null,
    lastSyncedAt: null,
    dataSince: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const missingStatsRow: CommitInsert = {
  sha: 'c1',
  repository_id: REPO_ID,
  contributor_id: 'contrib-3',
  author_login: 'committer',
  message: 'feat: cache',
  additions: null,
  deletions: null,
  is_merge: false,
  committed_at: '2026-10-01T07:00:00Z',
};

let github: {
  getRepositoryById: ReturnType<typeof vi.fn>;
  listPullRequestsUpdatedSince: ReturnType<typeof vi.fn>;
  getPullRequest: ReturnType<typeof vi.fn>;
  listReviews: ReturnType<typeof vi.fn>;
  listCommits: ReturnType<typeof vi.fn>;
  getCommit: ReturnType<typeof vi.fn>;
  getRemainingRequests: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });

  github = {
    getRepositoryById: vi.fn().mockResolvedValue(ghRepo),
    listPullRequestsUpdatedSince: vi.fn().mockResolvedValue([pr]),
    getPullRequest: vi.fn().mockResolvedValue(pr),
    listReviews: vi.fn().mockResolvedValue(reviews),
    listCommits: vi.fn().mockResolvedValue(commits),
    getCommit: vi.fn().mockResolvedValue({ ...commits[0], stats: { additions: 40, deletions: 2 } }),
    getRemainingRequests: vi.fn().mockResolvedValue(5000),
  };
  vi.mocked(GitHubService).mockImplementation(function () {
    return github as unknown as GitHubService;
  } as unknown as typeof GitHubService);

  vi.mocked(repositoryRepository.claimForSync).mockResolvedValue(repoRow());
  vi.mocked(repositoryRepository.findInstallationGithubId).mockResolvedValue(777);
  vi.mocked(repositoryRepository.update).mockResolvedValue();
  vi.mocked(repositoryRepository.markSyncSucceeded).mockResolvedValue();
  vi.mocked(repositoryRepository.markSyncFailed).mockResolvedValue();
  vi.mocked(contributorRepository.upsertIdentities).mockResolvedValue();
  vi.mocked(contributorRepository.findIdMap).mockResolvedValue(
    new Map([
      [1, 'contrib-1'],
      [2, 'contrib-2'],
      [3, 'contrib-3'],
    ]),
  );
  vi.mocked(pullRequestRepository.upsertMany).mockResolvedValue(new Map([[9001, 'pr-uuid']]));
  vi.mocked(reviewRepository.upsertMany).mockResolvedValue();
  vi.mocked(commitRepository.insertNew).mockResolvedValue();
  vi.mocked(commitRepository.findMissingStats).mockResolvedValue([missingStatsRow]);
  vi.mocked(commitRepository.saveStats).mockResolvedValue();
  vi.mocked(commitRepository.countMissingStats).mockResolvedValue(0);
  vi.mocked(analyticsRepository.refreshDailyMetrics).mockResolvedValue(181);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sync engine', () => {
  it('first sync reads the lookback window through the repository’s installation', async () => {
    await syncService.runNow(REPO_ID);
    expect(GitHubService).toHaveBeenCalledWith(777);
    const since: Date = github.listPullRequestsUpdatedSince.mock.calls[0][2];
    expect(since.toISOString()).toBe('2026-04-06T12:00:00.000Z'); // 180 days
    expect(github.listCommits.mock.calls[0][2]).toEqual(since);
  });

  it('incremental sync starts an hour before the last successful sync', async () => {
    vi.mocked(repositoryRepository.claimForSync).mockResolvedValue(
      repoRow({ lastSyncedAt: '2026-10-02T12:00:00.000Z', dataSince: '2026-04-06T12:00:00.000Z' }),
    );
    await syncService.runNow(REPO_ID);
    expect(github.listPullRequestsUpdatedSince.mock.calls[0][2].toISOString()).toBe('2026-10-02T11:00:00.000Z');
  });

  it('re-reads the full window when the start of synced data is unknown', async () => {
    // e.g. synced before data_since was tracked: an incremental read would misreport coverage
    vi.mocked(repositoryRepository.claimForSync).mockResolvedValue(
      repoRow({ lastSyncedAt: '2026-10-02T12:00:00.000Z', dataSince: null }),
    );
    await syncService.runNow(REPO_ID);
    expect(github.listPullRequestsUpdatedSince.mock.calls[0][2].toISOString()).toBe('2026-04-06T12:00:00.000Z');
    expect(vi.mocked(repositoryRepository.markSyncSucceeded).mock.calls[0][2]).toBe('2026-04-06T12:00:00.000Z');
  });

  it('follows renames by reading the repository by GitHub id and using its current name', async () => {
    await syncService.runNow(REPO_ID);
    expect(github.getRepositoryById).toHaveBeenCalledWith(555);
    expect(repositoryRepository.update).toHaveBeenCalledWith(
      REPO_ID,
      expect.objectContaining({ full_name: 'acme/api-renamed', is_archived: true, html_url: 'https://github.com/acme/api-renamed' }),
    );
    expect(github.getPullRequest).toHaveBeenCalledWith('acme', 'api-renamed', 12);
  });

  it('records contributors from PR authors, reviewers and commit authors', async () => {
    await syncService.runNow(REPO_ID);
    const ids = vi.mocked(contributorRepository.upsertIdentities).mock.calls[0][0].map((c) => c.github_id);
    expect(ids.sort()).toEqual([1, 2, 3]);
  });

  it('stores PRs with GitHub timestamps and a review summary that ignores self-review', async () => {
    await syncService.runNow(REPO_ID);
    const [row] = vi.mocked(pullRequestRepository.upsertMany).mock.calls[0][0];
    expect(row).toMatchObject({
      github_id: 9001,
      contributor_id: 'contrib-1',
      created_at: '2026-09-30T08:00:00Z',
      merged_at: '2026-10-01T08:00:00Z',
      additions: 30,
      review_count: 1,
      first_review_at: '2026-09-30T12:00:00Z',
    });
  });

  it('stores every review against its stored PR id', async () => {
    await syncService.runNow(REPO_ID);
    const rows = vi.mocked(reviewRepository.upsertMany).mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.pull_request_id === 'pr-uuid')).toBe(true);
  });

  it('inserts new commits without stats, then backfills stats within the rate budget', async () => {
    github.getRemainingRequests.mockResolvedValue(700);
    await syncService.runNow(REPO_ID);

    const [inserted] = vi.mocked(commitRepository.insertNew).mock.calls[0][0];
    expect(inserted).toMatchObject({ sha: 'c1', additions: null, contributor_id: 'contrib-3' });

    expect(commitRepository.findMissingStats).toHaveBeenCalledWith(REPO_ID, 400); // 700 - 300 reserve
    expect(vi.mocked(commitRepository.saveStats).mock.calls[0][0]).toEqual([
      { ...missingStatsRow, additions: 40, deletions: 2, is_merge: false },
    ]);
  });

  it('skips stats for commits GitHub no longer has instead of failing the sync', async () => {
    github.getCommit.mockRejectedValue(new GitHubError('gone', 404, 'GITHUB_NOT_FOUND', 404));
    vi.mocked(commitRepository.countMissingStats).mockResolvedValue(1);
    const summary = await syncService.runNow(REPO_ID);
    expect(commitRepository.saveStats).toHaveBeenCalledWith([]);
    expect(summary).toMatchObject({ commitStatsFetched: 0, commitStatsPending: 1 });
  });

  it('marks success with the sync start time and the start of imported data', async () => {
    const summary = await syncService.runNow(REPO_ID);
    expect(repositoryRepository.markSyncSucceeded).toHaveBeenCalledWith(
      REPO_ID,
      NOW.toISOString(),
      '2026-04-06T12:00:00.000Z', // first sync: start of the 180-day window
    );
    expect(repositoryRepository.markSyncFailed).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ pullRequests: 1, reviews: 2, commits: 1, commitStatsFetched: 1 });
  });

  it('recomputes daily metrics from the start of imported data through today', async () => {
    const summary = await syncService.runNow(REPO_ID);
    expect(analyticsRepository.refreshDailyMetrics).toHaveBeenCalledWith(REPO_ID, '2026-04-06', '2026-10-03');
    expect(summary.dailyMetricsRefreshed).toBe(181);
  });

  it('keeps the earliest data_since across incremental syncs', async () => {
    vi.mocked(repositoryRepository.claimForSync).mockResolvedValue(
      repoRow({ lastSyncedAt: '2026-10-02T12:00:00.000Z', dataSince: '2026-04-01T00:00:00.000Z' }),
    );
    await syncService.runNow(REPO_ID);
    expect(vi.mocked(repositoryRepository.markSyncSucceeded).mock.calls[0][2]).toBe('2026-04-01T00:00:00.000Z');
    expect(analyticsRepository.refreshDailyMetrics).toHaveBeenCalledWith(REPO_ID, '2026-04-01', '2026-10-03');
  });

  it('fails the sync if daily metrics cannot be recomputed', async () => {
    vi.mocked(analyticsRepository.refreshDailyMetrics).mockRejectedValue(new Error('db down'));
    await expect(syncService.runNow(REPO_ID)).rejects.toThrow('db down');
    expect(repositoryRepository.markSyncSucceeded).not.toHaveBeenCalled();
    expect(repositoryRepository.markSyncFailed).toHaveBeenCalled();
  });

  it('records GitHub failures with their user-facing message', async () => {
    github.listPullRequestsUpdatedSince.mockRejectedValue(
      new GitHubError('Failed to fetch pull requests: GitHub rate limit exceeded', 403, 'GITHUB_RATE_LIMITED', 503),
    );
    await expect(syncService.runNow(REPO_ID)).rejects.toThrow(/rate limit/);
    expect(repositoryRepository.markSyncFailed).toHaveBeenCalledWith(
      REPO_ID,
      'Failed to fetch pull requests: GitHub rate limit exceeded',
    );
    expect(repositoryRepository.markSyncSucceeded).not.toHaveBeenCalled();
  });

  it('hides internal error details from the recorded failure', async () => {
    vi.mocked(pullRequestRepository.upsertMany).mockRejectedValue({ message: 'relation "x" does not exist' });
    await expect(syncService.runNow(REPO_ID)).rejects.toBeDefined();
    expect(repositoryRepository.markSyncFailed).toHaveBeenCalledWith(REPO_ID, 'Sync failed due to an internal error');
  });

  it('fails clearly when the App no longer covers the repository', async () => {
    vi.mocked(repositoryRepository.findInstallationGithubId).mockResolvedValue(null);
    await expect(syncService.runNow(REPO_ID)).rejects.toMatchObject({ code: 'INSTALLATION_MISSING' });
    expect(GitHubService).not.toHaveBeenCalled();
  });

  it('refuses to start while another sync holds the repository', async () => {
    vi.mocked(repositoryRepository.claimForSync).mockResolvedValue(null);
    await expect(syncService.start(REPO_ID)).rejects.toMatchObject({ code: 'SYNC_IN_PROGRESS', statusCode: 409 });
  });
});

describe('POST /api/repositories/:id/sync', () => {
  beforeEach(() => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession(), user: testUser });
    vi.mocked(sessionRepository.touch).mockResolvedValue();
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
  });

  it('accepts with 202 and the repository in syncing state', async () => {
    const res = await request(app).post(`/api/repositories/${REPO_ID}/sync`).set(authHeaders);
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ id: REPO_ID, syncStatus: 'syncing' });
  });

  it('returns 409 when a sync is already running', async () => {
    vi.mocked(repositoryRepository.claimForSync).mockResolvedValue(null);
    const res = await request(app).post(`/api/repositories/${REPO_ID}/sync`).set(authHeaders);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SYNC_IN_PROGRESS');
  });
});
