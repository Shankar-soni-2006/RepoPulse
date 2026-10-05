// ============================================================
// API contract types live in /shared/contracts.d.ts and are
// re-exported here so backend code keeps one import path.
// ============================================================

import type { UserRole } from '@shared/contracts.js';

export type {
  ApiSuccess,
  ApiError,
  ApiResponse,
  Paginated,
  SyncStatus,
  Repository,
  PullRequestStatus,
  PullRequest,
  PullRequestSort,
  PullRequestListQuery,
  PullRequestDetail,
  WebhookEventSummary,
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
  AIInsightMode,
  AIInsightResult,
  SessionUser,
  InstallationSummary,
  SessionInfo,
  DiscoveryResult,
  UserRole,
  AdminOverview,
  AdminUser,
  AdminUserUpdate,
} from '@shared/contracts.js';

// ============================================================
// BACKEND-INTERNAL DOMAIN TYPES — not part of the API contract
// ============================================================

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
  role: UserRole;
  suspendedAt: string | null;
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
