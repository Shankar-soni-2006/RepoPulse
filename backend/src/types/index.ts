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
  Contributor,
  TimePeriod,
  AnalyticsMetrics,
  AnalyticsTrend,
  Analytics,
  AIInsightRequest,
  AIInsight,
  AIInsightResponse,
} from '@shared/contracts';

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
  committedAt: string;
  createdAt: string;
}

export interface DailyMetric {
  id: string;
  repositoryId: string;
  date: string;
  prCount: number;
  mergedPrCount: number;
  commitCount: number;
  additions: number;
  deletions: number;
  avgCycleTime: number | null;
  avgFirstReviewTime: number | null;
  activeContributors: number;
  reviewCount: number;
  avgPrSize: number | null;
}

export type WebhookEventStatus = 'received' | 'processed' | 'ignored' | 'failed';

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
