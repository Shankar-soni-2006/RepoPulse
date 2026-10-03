// ============================================================
// API contract types live in /shared/contracts.d.ts (shared with
// the backend) and are re-exported here.
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
  SessionUser,
  InstallationSummary,
  SessionInfo,
  DiscoveryResult,
} from '@shared/contracts';

import type { PullRequestStatus } from '@shared/contracts';

// ============================================================
// UI STATE TYPES
// ============================================================

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PullRequestFilters {
  status?: PullRequestStatus;
  search?: string;
  from?: string;
  to?: string;
}
