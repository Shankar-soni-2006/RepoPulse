// ============================================================
// API contract types live in /shared/contracts.d.ts and are
// re-exported here so backend code keeps one import path.
// ============================================================

export type {
  ApiSuccess,
  ApiError,
  ApiResponse,
  Paginated,
  SyncStatus,
  Repository,
  PullRequestStatus,
  PullRequest,
  ReviewState,
  Review,
  ContributorActivity,
  ContributorActivityReport,
  TimePeriod,
  AnalyticsPeriod,
  PeriodMetrics,
  ComparableMetric,
  MetricChanges,
  DataQuality,
  MetricsSummary,
  DailyTrend,
  Analytics,
  AIInsightRequest,
  AIInsight,
  AIInsightResponse,
  SessionUser,
  InstallationSummary,
  SessionInfo,
  DiscoveryResult,
} from '@shared/contracts.js';

// ============================================================
// BACKEND-INTERNAL DOMAIN TYPES — not part of the API contract
// ============================================================

export interface Commit {
  id: string;
  sha: string;
  repositoryId: string;
  authorId: string | null;
  authorLogin: string | null;
  message: string;
  /** null when GitHub stats were not fetched */
  additions: number | null;
  deletions: number | null;
  /** Merge commits repeat merged changes; excluded from churn */
  isMerge: boolean;
  committedAt: string;
  createdAt: string;
}

export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'ignored' | 'failed';

export interface WebhookEvent {
  id: string;
  repositoryId: string | null;
  eventType: string;
  action: string | null;
  githubDeliveryId: string;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  processingError: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

// Server-side session. Tokens stay encrypted until a GitHub call needs them.
export interface Session {
  id: string;
  userId: string;
  encryptedAccessToken: string;
  accessTokenExpiresAt: string | null;
  encryptedRefreshToken: string | null;
  refreshTokenExpiresAt: string | null;
  expiresAt: string;
  lastSeenAt: string;
}

export interface GitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
}
