import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { createAppAuth } from '@octokit/auth-app';
import { githubAppCredentials } from '../../config/github.js';
import { GitHubError } from '../../utils/errors.js';

// Octokit with rate-limit awareness: waits out primary/secondary limits a bounded
// number of times, and retries transient 5xx failures.
const RepoPulseOctokit = Octokit.plugin(throttling, retry);

const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_SECONDS = 60;

const throttle = {
  onRateLimit: (retryAfter: number, options: { method: string; url: string }, _o: unknown, retryCount: number) => {
    console.warn(`[github] rate limit hit for ${options.method} ${options.url}; retry after ${retryAfter}s`);
    return retryCount < MAX_RATE_LIMIT_RETRIES && retryAfter <= MAX_RATE_LIMIT_WAIT_SECONDS;
  },
  onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }, _o: unknown, retryCount: number) => {
    console.warn(`[github] secondary rate limit for ${options.method} ${options.url}; retry after ${retryAfter}s`);
    return retryCount < MAX_RATE_LIMIT_RETRIES && retryAfter <= MAX_RATE_LIMIT_WAIT_SECONDS;
  },
};

export type GitHubClient = InstanceType<typeof RepoPulseOctokit>;

// Acts as the signed-in user (GitHub App user-to-server token)
export function createUserOctokit(accessToken: string): GitHubClient {
  return new RepoPulseOctokit({ auth: accessToken, throttle });
}

// Acts as the GitHub App installation; tokens are minted and refreshed automatically
export function createInstallationOctokit(installationId: number): GitHubClient {
  return new RepoPulseOctokit({
    authStrategy: createAppAuth,
    auth: { ...githubAppCredentials, installationId },
    throttle,
  });
}

// Acts as the GitHub App itself (JWT) — app metadata only
export function createAppOctokit(): GitHubClient {
  return new RepoPulseOctokit({
    authStrategy: createAppAuth,
    auth: githubAppCredentials,
    throttle,
  });
}

interface OctokitLikeError {
  status?: number;
  response?: { headers?: Record<string, string | number | undefined> };
}

// Translate an Octokit failure into an API error with a stable code
export function toGitHubError(err: unknown, message: string): GitHubError {
  if (err instanceof GitHubError) return err;
  const { status, response } = (err ?? {}) as OctokitLikeError;
  const remaining = response?.headers?.['x-ratelimit-remaining'];

  if (status === 429 || (status === 403 && String(remaining) === '0')) {
    return new GitHubError(`${message}: GitHub rate limit exceeded, try again later`, status, 'GITHUB_RATE_LIMITED', 503);
  }
  if (status === 401) {
    return new GitHubError(`${message}: GitHub rejected the credentials`, status, 'GITHUB_UNAUTHORIZED', 401);
  }
  if (status === 403) {
    return new GitHubError(`${message}: access denied by GitHub`, status, 'GITHUB_FORBIDDEN', 403);
  }
  if (status === 404) {
    return new GitHubError(`${message}: not found on GitHub or not accessible`, status, 'GITHUB_NOT_FOUND', 404);
  }
  return new GitHubError(`${message}: GitHub request failed`, status);
}
