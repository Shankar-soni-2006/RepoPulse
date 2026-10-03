import type {
  GHRepository,
  GHPullRequest,
  GHReview,
  GHCommit,
  GHContributor,
} from './githubService';

// ---- Normalized insert shapes (no id/created_at) ----

export interface NormalizedRepository {
  github_id: number;
  name: string;
  full_name: string;
  owner: string;
  description: string | null;
  visibility: 'public' | 'private' | 'internal';
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  sync_status: 'idle';
}

export interface NormalizedPullRequest {
  github_id: number;
  repository_id: string;
  contributor_id: string | null;
  number: number;
  title: string;
  body: string | null;
  author_login: string;
  status: 'open' | 'closed' | 'merged';
  labels: string[];
  additions: number;
  deletions: number;
  changed_files: number;
  review_count: number;
  first_review_at: string | null;
  cycle_time: number | null;
  first_review_time: number | null;
  pr_size: number;
  merged_at: string | null;
  closed_at: string | null;
}

export interface NormalizedReview {
  github_id: number;
  pull_request_id: string;
  repository_id: string;
  contributor_id: string | null;
  reviewer_login: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending';
  submitted_at: string;
}

export interface NormalizedCommit {
  sha: string;
  repository_id: string;
  contributor_id: string | null;
  author_login: string | null;
  message: string;
  additions: number;
  deletions: number;
  committed_at: string;
}

export interface NormalizedContributor {
  github_id: number;
  repository_id: string;
  login: string;
  avatar_url: string | null;
  name: string | null;
  commit_count: number;
  pull_request_count: number;
  review_count: number;
  additions: number;
  deletions: number;
  first_contribution_at: string | null;
  last_contribution_at: string | null;
}

// ---- Normalizer functions ----

export function normalizeRepository(gh: GHRepository): NormalizedRepository {
  const visibility =
    gh.visibility === 'internal' ? 'internal' : gh.private ? 'private' : 'public';
  return {
    github_id: gh.id,
    name: gh.name,
    full_name: gh.full_name,
    owner: gh.owner.login,
    description: gh.description,
    visibility,
    default_branch: gh.default_branch,
    language: gh.language,
    stargazers_count: gh.stargazers_count,
    forks_count: gh.forks_count,
    open_issues_count: gh.open_issues_count,
    sync_status: 'idle',
  };
}

export function normalizePullRequest(
  gh: GHPullRequest,
  repositoryId: string,
  contributorIdMap: Map<string, string>,
): NormalizedPullRequest {
  const status: NormalizedPullRequest['status'] =
    gh.merged_at ? 'merged' : gh.state === 'closed' ? 'closed' : 'open';

  const authorLogin = gh.user?.login ?? 'unknown';
  const contributorId = contributorIdMap.get(authorLogin) ?? null;

  const prSize = gh.additions + gh.deletions;

  // cycle_time and first_review_time calculated after reviews are fetched
  return {
    github_id: gh.id,
    repository_id: repositoryId,
    contributor_id: contributorId,
    number: gh.number,
    title: gh.title,
    body: gh.body,
    author_login: authorLogin,
    status,
    labels: gh.labels.map((l) => l.name),
    additions: gh.additions,
    deletions: gh.deletions,
    changed_files: gh.changed_files,
    review_count: 0,
    first_review_at: null,
    cycle_time: gh.merged_at
      ? (new Date(gh.merged_at).getTime() - new Date(gh.created_at).getTime()) / 3_600_000
      : null,
    first_review_time: null,
    pr_size: prSize,
    merged_at: gh.merged_at,
    closed_at: gh.closed_at,
  };
}

export function normalizeReview(
  gh: GHReview,
  pullRequestId: string,
  repositoryId: string,
  contributorIdMap: Map<string, string>,
): NormalizedReview {
  const reviewerLogin = gh.user?.login ?? 'unknown';
  const rawState = gh.state.toLowerCase();
  const validStates = ['approved', 'changes_requested', 'commented', 'dismissed', 'pending'];
  const state = validStates.includes(rawState)
    ? (rawState as NormalizedReview['state'])
    : 'commented';

  return {
    github_id: gh.id,
    pull_request_id: pullRequestId,
    repository_id: repositoryId,
    contributor_id: contributorIdMap.get(reviewerLogin) ?? null,
    reviewer_login: reviewerLogin,
    state,
    submitted_at: gh.submitted_at,
  };
}

export function normalizeCommit(
  gh: GHCommit,
  repositoryId: string,
  contributorIdMap: Map<string, string>,
): NormalizedCommit {
  const authorLogin = gh.author?.login ?? null;
  return {
    sha: gh.sha,
    repository_id: repositoryId,
    contributor_id: authorLogin ? (contributorIdMap.get(authorLogin) ?? null) : null,
    author_login: authorLogin,
    message: gh.commit.message.split('\n')[0].slice(0, 500),
    additions: gh.stats?.additions ?? 0,
    deletions: gh.stats?.deletions ?? 0,
    committed_at: gh.commit.author?.date ?? new Date().toISOString(),
  };
}

export function normalizeContributor(
  gh: GHContributor,
  repositoryId: string,
): NormalizedContributor {
  return {
    github_id: gh.id,
    repository_id: repositoryId,
    login: gh.login,
    avatar_url: gh.avatar_url,
    name: gh.name ?? null,
    commit_count: gh.contributions,
    pull_request_count: 0,
    review_count: 0,
    additions: 0,
    deletions: 0,
    first_contribution_at: null,
    last_contribution_at: null,
  };
}
