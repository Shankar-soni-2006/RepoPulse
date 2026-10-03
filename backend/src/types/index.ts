// ============================================================
// DOMAIN TYPES — authoritative internal models
// ============================================================

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
  syncStatus: 'idle' | 'syncing' | 'error' | 'never';
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequest {
  id: string;
  githubId: number;
  repositoryId: string;
  number: number;
  title: string;
  body: string | null;
  authorId: string | null;
  authorLogin: string;
  status: 'open' | 'closed' | 'merged';
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewCount: number;
  firstReviewAt: string | null;
  cycleTime: number | null;
  firstReviewTime: number | null;
  prSize: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface Review {
  id: string;
  githubId: number;
  pullRequestId: string;
  repositoryId: string;
  reviewerId: string | null;
  reviewerLogin: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending';
  submittedAt: string;
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

export interface Commit {
  id: string;
  sha: string;
  repositoryId: string;
  authorId: string | null;
  authorLogin: string | null;
  message: string;
  additions: number;
  deletions: number;
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
}

export interface AnalyticsMetrics {
  cycleTime: number | null;
  firstReviewTime: number | null;
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

export interface WebhookEvent {
  id: string;
  repositoryId: string | null;
  eventType: string;
  action: string | null;
  githubDeliveryId: string;
  payload: Record<string, unknown>;
  processedAt: string | null;
  createdAt: string;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

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

// ============================================================
// AI TYPES
// ============================================================

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
