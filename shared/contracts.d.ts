// ============================================================
// REPOPULSE API CONTRACT — single source of truth for the shapes
// exchanged between backend and frontend.
//
// Types only (declaration file): import with `import type` from
// `@shared/contracts`. Nothing here exists at runtime.
// ============================================================

// ---- Envelope ----

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface Paginated<T> {
  items: T[];
  total: number;
}

// ---- Domain ----

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'never';

export interface Repository {
  id: string;
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  visibility: 'public' | 'private' | 'internal';
  defaultBranch: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  syncStatus: SyncStatus;
  /** Last sync failure message; null when the last sync succeeded */
  syncError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PullRequestStatus = 'open' | 'closed' | 'merged';

export interface PullRequest {
  id: string;
  githubId: number;
  repositoryId: string;
  number: number;
  title: string;
  body: string | null;
  authorId: string | null;
  authorLogin: string;
  status: PullRequestStatus;
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewCount: number;
  firstReviewAt: string | null;
  /** hours */
  cycleTime: number | null;
  /** hours */
  firstReviewTime: number | null;
  prSize: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending';

export interface Review {
  id: string;
  githubId: number;
  pullRequestId: string;
  repositoryId: string;
  reviewerId: string | null;
  reviewerLogin: string;
  state: ReviewState;
  /** null for pending (unsubmitted) reviews */
  submittedAt: string | null;
  createdAt: string;
}

export interface Contributor {
  id: string;
  githubId: number;
  repositoryId: string;
  login: string;
  avatarUrl: string | null;
  name: string | null;
  commitCount: number;
  pullRequestCount: number;
  reviewCount: number;
  additions: number;
  deletions: number;
  firstContributionAt: string | null;
  lastContributionAt: string | null;
}

// ---- Analytics ----

export type TimePeriod = 7 | 30 | 90;

export interface AnalyticsMetrics {
  /** hours */
  cycleTime: number | null;
  /** hours */
  firstReviewTime: number | null;
  /** hours */
  reviewDelay: number | null;
  prThroughput: number;
  codeChurn: number;
  avgPrSize: number;
  commitCount: number;
  activeContributors: number;
}

export interface AnalyticsTrend {
  date: string;
  cycleTime: number | null;
  firstReviewTime: number | null;
  prCount: number;
  mergedPrCount: number;
  codeChurn: number;
  commitCount: number;
}

export interface Analytics {
  repositoryId: string;
  period: { from: string; to: string; days: number };
  metrics: AnalyticsMetrics;
  trends: AnalyticsTrend[];
}

// ---- AI ----

export interface AIInsightRequest {
  repositoryId: string;
  period: { from: string; to: string };
  question?: string;
}

export interface AIInsight {
  title: string;
  type: 'trend' | 'anomaly' | 'bottleneck' | 'comparison' | 'observation';
  severity: 'low' | 'medium' | 'high';
  fact: string;
  evidence: string[];
  possibleExplanation: string;
  recommendedInvestigation: string;
}

export interface AIInsightResponse {
  summary: string;
  insights: AIInsight[];
  dataLimitations: string[];
}

// ---- Auth / session ----

export interface SessionUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface InstallationSummary {
  id: string;
  accountLogin: string;
  accountType: 'User' | 'Organization';
}

export interface SessionInfo {
  user: SessionUser;
  /** GitHub App installations visible to this user */
  installations: InstallationSummary[];
  /** Where the user can install the GitHub App on more accounts; null if unavailable */
  installUrl: string | null;
}

export interface DiscoveryResult {
  installations: number;
  repositories: number;
}
