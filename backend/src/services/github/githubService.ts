import { Octokit } from '@octokit/rest';
import { githubApp } from '../config/github';
import { GitHubError } from '../utils/errors';

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

export interface GHPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  user: { login: string; id: number } | null;
  state: string;
  labels: { name: string }[];
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
  submitted_at: string;
}

export interface GHCommit {
  sha: string;
  author: { login: string } | null;
  commit: {
    author: { name: string; date: string } | null;
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
  private octokit: Octokit;

  constructor(installationId: number) {
    // Will be initialized async — use factory method
    this.octokit = new Octokit();
    this._installationId = installationId;
  }

  private _installationId: number;

  static async create(installationId: number): Promise<GitHubService> {
    const service = new GitHubService(installationId);
    await service._init();
    return service;
  }

  private async _init(): Promise<void> {
    const { token } = await githubApp.getInstallationOctokit(this._installationId).then(
      async (kit) => {
        // Extract token via auth
        const auth = await (kit as unknown as { auth: (opts: { type: string }) => Promise<{ token: string }> }).auth({ type: 'installation' });
        return auth;
      },
    );
    this.octokit = new Octokit({ auth: token });
  }

  async getRepository(owner: string, repo: string): Promise<GHRepository> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return data as GHRepository;
    } catch (err: unknown) {
      throw new GitHubError(`Failed to fetch repository ${owner}/${repo}`, (err as { status?: number }).status);
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
      throw new GitHubError('Failed to list installation repositories', (err as { status?: number }).status);
    }
  }

  async listPullRequests(owner: string, repo: string): Promise<GHPullRequest[]> {
    try {
      const prs: GHPullRequest[] = [];
      for await (const { data } of this.octokit.paginate.iterator(
        this.octokit.pulls.list,
        { owner, repo, state: 'all', per_page: 100 },
      )) {
        prs.push(...(data as GHPullRequest[]));
      }
      return prs;
    } catch (err: unknown) {
      throw new GitHubError(`Failed to fetch pull requests for ${owner}/${repo}`, (err as { status?: number }).status);
    }
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GHPullRequest> {
    try {
      const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: pullNumber });
      return data as GHPullRequest;
    } catch (err: unknown) {
      throw new GitHubError(`Failed to fetch PR #${pullNumber}`, (err as { status?: number }).status);
    }
  }

  async listReviews(owner: string, repo: string, pullNumber: number): Promise<GHReview[]> {
    try {
      const { data } = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      return data as GHReview[];
    } catch (err: unknown) {
      throw new GitHubError(`Failed to fetch reviews for PR #${pullNumber}`, (err as { status?: number }).status);
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
      throw new GitHubError(`Failed to fetch commits for ${owner}/${repo}`, (err as { status?: number }).status);
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
      throw new GitHubError(`Failed to fetch contributors for ${owner}/${repo}`, (err as { status?: number }).status);
    }
  }
}

// ---- User-authenticated Octokit (OAuth token) ----

export function createUserOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

export async function getAuthenticatedUser(accessToken: string) {
  const octokit = createUserOctokit(accessToken);
  const { data } = await octokit.users.getAuthenticated();
  return data;
}

export async function listUserInstallations(accessToken: string) {
  const octokit = createUserOctokit(accessToken);
  const { data } = await octokit.apps.listInstallationsForAuthenticatedUser({ per_page: 100 });
  return data.installations;
}
