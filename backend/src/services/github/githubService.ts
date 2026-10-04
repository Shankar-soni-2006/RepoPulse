import { createInstallationOctokit, toGitHubError, type GitHubClient } from './octokit.js';

// ---- Types returned by GitHub API (relevant fields only) ----

export interface GHUser {
  id: number;
  login: string;
  avatar_url?: string;
}

export interface GHRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  visibility?: string;
  default_branch: string;
  language: string | null;
  html_url: string;
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

// Shape returned by `pulls.list` — the list endpoint omits size fields
export interface GHPullRequestSummary {
  id: number;
  number: number;
  title: string;
  body: string | null;
  user: GHUser | null;
  state: string;
  labels: { name?: string }[];
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

// Shape returned by `pulls.get` — includes size fields
export interface GHPullRequest extends GHPullRequestSummary {
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GHReview {
  id: number;
  user: GHUser | null;
  state: string;
  submitted_at?: string | null; // absent for pending reviews
}

export interface GHCommit {
  sha: string;
  author: GHUser | null; // null when the commit email isn't linked to a GitHub account
  commit: {
    author: { name?: string; date?: string } | null;
    committer: { name?: string; date?: string } | null;
    message: string;
  };
  parents: { sha: string }[];
  stats?: { additions?: number; deletions?: number }; // only on the single-commit endpoint
}

// ---- GitHub Service (installation-scoped) ----

export class GitHubService {
  private readonly octokit: GitHubClient;

  // Rate-limit aware client with an auto-refreshing installation token
  constructor(installationId: number) {
    this.octokit = createInstallationOctokit(installationId);
  }

  /** By numeric id, so renamed or transferred repositories still resolve. */
  async getRepositoryById(githubId: number): Promise<GHRepository> {
    try {
      const { data } = await this.octokit.request('GET /repositories/{repository_id}', {
        repository_id: githubId,
      });
      return data as GHRepository;
    } catch (err) {
      throw toGitHubError(err, `Failed to fetch repository ${githubId}`);
    }
  }

  /**
   * Pull requests updated at or after `since` (all when null), newest-updated first.
   * Stops paginating once it reaches older PRs, so incremental syncs stay cheap.
   */
  async listPullRequestsUpdatedSince(
    owner: string,
    repo: string,
    since: Date | null,
  ): Promise<GHPullRequestSummary[]> {
    try {
      const prs: GHPullRequestSummary[] = [];
      for await (const { data } of this.octokit.paginate.iterator(this.octokit.pulls.list, {
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      })) {
        for (const pr of data as GHPullRequestSummary[]) {
          if (since && Date.parse(pr.updated_at) < since.getTime()) return prs;
          prs.push(pr);
        }
      }
      return prs;
    } catch (err) {
      throw toGitHubError(err, `Failed to fetch pull requests for ${owner}/${repo}`);
    }
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GHPullRequest> {
    try {
      const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: pullNumber });
      return data as GHPullRequest;
    } catch (err) {
      throw toGitHubError(err, `Failed to fetch PR #${pullNumber}`);
    }
  }

  async listReviews(owner: string, repo: string, pullNumber: number): Promise<GHReview[]> {
    try {
      return (await this.octokit.paginate(this.octokit.pulls.listReviews, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      })) as GHReview[];
    } catch (err) {
      throw toGitHubError(err, `Failed to fetch reviews for PR #${pullNumber}`);
    }
  }

  /** Commits on the default branch since `since` (all when null). No stats. */
  async listCommits(owner: string, repo: string, since: Date | null): Promise<GHCommit[]> {
    try {
      return (await this.octokit.paginate(this.octokit.repos.listCommits, {
        owner,
        repo,
        per_page: 100,
        ...(since ? { since: since.toISOString() } : {}),
      })) as GHCommit[];
    } catch (err) {
      throw toGitHubError(err, `Failed to fetch commits for ${owner}/${repo}`);
    }
  }

  /** Single commit, including line stats and parents. */
  async getCommit(owner: string, repo: string, sha: string): Promise<GHCommit> {
    try {
      const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
      return data as GHCommit;
    } catch (err) {
      throw toGitHubError(err, `Failed to fetch commit ${sha.slice(0, 7)}`);
    }
  }

  /** Remaining core REST requests in the current rate-limit window. */
  async getRemainingRequests(): Promise<number> {
    try {
      const { data } = await this.octokit.rateLimit.get();
      return data.resources.core.remaining;
    } catch (err) {
      throw toGitHubError(err, 'Failed to read GitHub rate limit');
    }
  }
}
