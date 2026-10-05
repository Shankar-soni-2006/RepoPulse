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

export type SyncStatus = 'never' | 'syncing' | 'synced' | 'failed';

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
  /** GitHub web URL */
  htmlUrl: string | null;
  isFork: boolean;
  isArchived: boolean;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  syncStatus: SyncStatus;
  /** Last sync failure message; null when the last sync succeeded */
  syncError: string | null;
  lastSyncedAt: string | null;
  /** Earliest point covered by synced data */
  dataSince: string | null;
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

export type PullRequestSort =
  | 'created'
  | 'updated'
  | 'merged'
  | 'firstReview'
  | 'cycleTime'
  | 'prSize'
  | 'reviewCount'
  | 'number';

export interface PullRequestListQuery {
  status?: PullRequestStatus;
  /** Title text, or a PR number ("142" / "#142") */
  search?: string;
  /** created_at range, ISO dates */
  from?: string;
  to?: string;
  sort?: PullRequestSort;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
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

export interface PullRequestDetail extends PullRequest {
  /** Oldest first; pending reviews last */
  reviews: Review[];
}

export interface WebhookEventSummary {
  id: string;
  eventType: string;
  action: string | null;
  status: 'received' | 'processing' | 'processed' | 'ignored' | 'failed';
  /** Reason for ignored/failed */
  processingError: string | null;
  createdAt: string;
  processedAt: string | null;
}

/**
 * A contributor's activity in a period. Descriptive only: RepoPulse measures
 * repository activity and never ranks people. Lists are alphabetical.
 */
export interface ContributorActivity {
  contributorId: string;
  githubId: number;
  login: string;
  avatarUrl: string | null;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  /** Lines in non-merge commits with known stats */
  additions: number;
  deletions: number;
  lastActiveAt: string | null;
  /** Commits + PRs opened + reviews per 7-day bucket, oldest first */
  weeklyActivity: number[];
}

export interface ContributorActivityReport {
  period: AnalyticsPeriod;
  contributors: ContributorActivity[];
}

// ---- Analytics ----
// Authoritative values computed by the backend; clients display them as-is.
// Durations are hours; days are UTC.

export type TimePeriod = 7 | 30 | 90;

export interface AnalyticsPeriod {
  /** inclusive, ISO timestamp */
  from: string;
  /** exclusive, ISO timestamp */
  to: string;
  days: TimePeriod;
}

export interface PeriodMetrics {
  /** PRs merged in the period */
  prThroughput: number;
  /** PRs opened in the period */
  prsOpened: number;
  /** Median hours from PR creation to merge, PRs merged in the period */
  cycleTime: number | null;
  /** Median hours from PR creation to first review, PRs first reviewed in the period */
  firstReviewTime: number | null;
  /** Mean hours from PR creation to first review (same PRs); sensitive to long waits */
  reviewDelay: number | null;
  /** Median lines changed (additions + deletions), PRs merged in the period */
  prSize: number | null;
  /** Lines added + deleted in non-merge commits with known stats */
  codeChurn: number;
  additions: number;
  deletions: number;
  commitCount: number;
  /** Submitted reviews, excluding authors reviewing their own PRs */
  reviewCount: number;
  activeContributors: number;
  /** PRs open at period end with no review yet */
  openPrsWithoutReview: number;
  /** Hours the oldest of those has waited at period end */
  oldestUnreviewedWait: number | null;
  /** Non-merge commits whose line stats are not yet known */
  commitsMissingStats: number;
}

export type ComparableMetric =
  | 'prThroughput'
  | 'prsOpened'
  | 'cycleTime'
  | 'firstReviewTime'
  | 'reviewDelay'
  | 'prSize'
  | 'codeChurn'
  | 'commitCount'
  | 'reviewCount'
  | 'activeContributors';

/** Fractional change vs the previous period (0.27 = +27%); null when not computable */
export type MetricChanges = Record<ComparableMetric, number | null>;

export interface DataQuality {
  /** Earliest point covered by synced data; null if never synced */
  dataSince: string | null;
  lastSyncedAt: string | null;
  /** Share of non-merge commits in the period with known line stats; null if none */
  commitStatsCoverage: number | null;
  /** Human-readable caveats for this result */
  limitations: string[];
}

export interface MetricsSummary {
  repositoryId: string;
  period: AnalyticsPeriod;
  previousPeriod: { from: string; to: string };
  metrics: PeriodMetrics;
  previousMetrics: PeriodMetrics;
  changes: MetricChanges;
  dataQuality: DataQuality;
  generatedAt: string;
}

export interface DailyTrend {
  /** UTC date, YYYY-MM-DD */
  date: string;
  prsOpened: number;
  prThroughput: number;
  cycleTime: number | null;
  firstReviewTime: number | null;
  reviewDelay: number | null;
  prSize: number | null;
  codeChurn: number;
  commitCount: number;
  reviewCount: number;
  activeContributors: number;
}

export interface Analytics extends MetricsSummary {
  trends: DailyTrend[];
}

// ---- AI ----

/**
 * What the analysis should focus on:
 * - summary      overall repository engineering summary
 * - trends       explain how metrics moved vs the previous period
 * - anomalies    unusual values or sudden changes
 * - bottlenecks  where work waits (reviews, large PRs, backlog)
 * - comparison   compare this period with the previous one, metric by metric
 * - question     answer `question` from the data
 */
export type AIInsightMode = 'summary' | 'trends' | 'anomalies' | 'bottlenecks' | 'comparison' | 'question';

export interface AIInsightRequest {
  repositoryId: string;
  /** Analysis period; defaults to 30 */
  days?: TimePeriod;
  mode: AIInsightMode;
  /** Required when mode is 'question'; max 500 characters */
  question?: string;
}

export interface AIInsight {
  title: string;
  type: 'trend' | 'anomaly' | 'bottleneck' | 'comparison' | 'observation';
  severity: 'low' | 'medium' | 'high';
  /** What the data shows (backend-computed values only) */
  fact: string;
  /** Specific supporting data points */
  evidence: string[];
  /** A hypothesis, not an established fact */
  possibleExplanation: string;
  recommendedInvestigation: string;
}

export interface AIInsightResponse {
  summary: string;
  insights: AIInsight[];
  /** Caveats from the data plus any the model added */
  dataLimitations: string[];
}

export interface AIInsightResult extends AIInsightResponse {
  meta: {
    mode: AIInsightMode;
    period: AnalyticsPeriod;
    /** Provider host and model that produced the answer */
    provider: string;
    model: string;
    generatedAt: string;
    /** True when served from cache (same data, same question) */
    cached: boolean;
    /** Insights dropped because they cited numbers absent from the supplied data */
    rejectedInsights: number;
  };
}

// ---- Auth / session ----

/** What a user may do in RepoPulse itself. Repository data is always gated by GitHub access. */
export type UserRole = 'admin' | 'member';

export interface SessionUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
}

export interface InstallationSummary {
  id: string;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  /** GitHub page where the account owner chooses which repositories the App can access */
  manageUrl: string;
}

export interface SessionInfo {
  user: SessionUser;
  /** GitHub App installations visible to this user */
  installations: InstallationSummary[];
  /** Where the user can install the GitHub App on more accounts; null if unavailable */
  installUrl: string | null;
}

// ---- Admin (role 'admin' only) ----

export interface AdminOverview {
  users: number;
  admins: number;
  suspended: number;
  newUsers7d: number;
  activeSessions: number;
  repositories: number;
  syncedRepositories: number;
  failedSyncs: number;
  webhookFailures24h: number;
}

export interface AdminUser {
  id: string;
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  /** Set when suspended: signed out everywhere and unable to sign in */
  suspendedAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  repositoryCount: number;
  activeSessions: number;
}

export interface AdminUserUpdate {
  role?: UserRole;
  suspended?: boolean;
}

export interface DiscoveryResult {
  installations: number;
  repositories: number;
}
