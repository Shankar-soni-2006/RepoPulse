import { createInstallationOctokit, toGitHubError, type GitHubClient } from './octokit';

// ---- Types returned by GitHub API (relevant fields only) ----

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
  user: { login: string; id: number } | null;
  state: string;
  labels: { name?: string }[];
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

// Shape returned by `pulls.get` — includes size fields
export interface GHPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  user: { login: string; id: number } | null;
  state: string;
  labels: { name?: string }[];
  additions: number;
  deletions: number;
  changed_files: number;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export interface GHReview {
  id: number;
  user: { login: string; id: number } | null;
  state: string;
  submitted_at?: string | null; // absent for pending reviews
}

export interface GHCommit {
  sha: string;
  author: { login: string } | null;
  commit: {
    author: { name?: string; date?: string } | null;
    committer: { name?: string; date?: string } | null;
    message: string;
  };
  stats?: { additions: number; deletions: number };
}

export interface GHContributor {
  id: number;
  login: string;
  avatar_url: string;
  name?: string | null;
  contributions: number;
}

// ---- GitHub Service ----

export class GitHubService {
  private readonly octokit: GitHubClient;

  // Installation-scoped client (rate-limit aware, auto-refreshing installation token)
  constructor(installationId: number) {
    this.octokit = createInstallationOctokit(installationId);
  }

  async getRepository(owner: string, repo: string): Promise<GHRepository> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return data as GHRepository;
    } catch (err: unknown) {
      throw toGitHubError(err, `Failed to fetch repository ${owner}/${repo}`);
    }
  }

  async listInstallationRepositories(): Promise<GHRepository[]> {
    try {
      const repos: GHRepository[] = [];
      for await (const { data } of this.octokit.paginate.iterator(
        this.octokit.apps.listReposAccessibleToInstallation,
        { per_page: 100 },
      )) {
        repos.push(...(data as GHRepository[]));
      }
      return repos;
    } catch (err: unknown) {
      throw toGitHubError(err, 'Failed to list installation repositories');
    }
  }

  async listPullRequests(owner: string, repo: string): Promise<GHPullRequestSummary[]> {
    try {
      const prs: GHPullRequestSummary[] = [];
      for await (const { data } of this.octokit.paginate.iterator(
        this.octokit.pulls.list,
        { owner, repo, state: 'all', per_page: 100 },
      )) {
        prs.push(...data);
      }
      return prs;
    } catch (err: unknown) {
      throw toGitHubError(err, `Failed to fetch pull requests for ${owner}/${repo}`);
    }
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GHPullRequest> {
    try {
      const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: pullNumber });
      return data as GHPullRequest;
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      throw toGitHubError(err, `Failed to fetch reviews for PR #${pullNumber}`);
    }
  }

  async listCommits(owner: string, repo: string, since?: string): Promise<GHCommit[]> {
    try {
      const commits: GHCommit[] = [];
      const params: Parameters<typeof this.octokit.repos.listCommits>[0] = {
        owner,
        repo,
        per_page: 100,
      };
      if (since) params.since = since;

      for await (const { data } of this.octokit.paginate.iterator(
        this.octokit.repos.listCommits,
        params,
      )) {
        commits.push(...(data as GHCommit[]));
      }
      return commits;
    } catch (err: unknown) {
      throw toGitHubError(err, `Failed to fetch commits for ${owner}/${repo}`);
    }
  }

  async listContributors(owner: string, repo: string): Promise<GHContributor[]> {
    try {
      const contributors: GHContributor[] = [];
      for await (const { data } of this.octokit.paginate.iterator(
        this.octokit.repos.listContributors,
        { owner, repo, per_page: 100 },
      )) {
        contributors.push(...(data as GHContributor[]));
      }
      return contributors;
    } catch (err: unknown) {
      throw toGitHubError(err, `Failed to fetch contributors for ${owner}/${repo}`);
    }
  }
}
