import { supabase } from '../config/supabase.js';
import type { DailyTrend, PeriodMetrics, TeamMemberActivity } from '../types/index.js';
import { num, numOrNull, toPeriodMetrics, type PeriodMetricsRow } from './analyticsRepository.js';

// Team view queries (migration 009). Callers pass only repository ids the user may
// access; these functions don't check access themselves.

export interface AccessibleRepository {
  id: string;
  fullName: string;
  installationId: string | null;
  lastSyncedAt: string | null;
  dataSince: string | null;
}

interface MemberRow {
  github_id: number | string;
  login: string;
  avatar_url: string | null;
  repositories: number;
  commits: number;
  prs_opened: number;
  prs_merged: number;
  reviews: number;
  additions: number | string;
  deletions: number | string;
  last_active_at: string | null;
  weekly_activity: number[] | null;
}

interface BreakdownRow {
  repository_id: string;
  pr_throughput: number;
  prs_opened: number;
  cycle_time: number | string | null;
  review_count: number;
  commit_count: number;
  code_churn: number | string;
  active_contributors: number;
}

interface DailyRow {
  metric_date: string;
  prs_opened: number;
  pr_throughput: number;
  cycle_time: number | string | null;
  first_review_time: number | string | null;
  review_delay: number | string | null;
  pr_size: number | string | null;
  code_churn: number | string;
  commit_count: number;
  review_count: number;
  active_contributors: number;
}

const range = (ids: string[], from: Date, to: Date) => ({
  p_repository_ids: ids,
  p_from: from.toISOString(),
  p_to: to.toISOString(),
});

export const teamRepository = {
  /** Every repository the user may access (via GitHub), with its installation. */
  async accessibleRepositories(userId: string): Promise<AccessibleRepository[]> {
    const { data, error } = await supabase
      .from('user_repositories')
      .select('repositories!inner(id, full_name, installation_id, last_synced_at, data_since)')
      .eq('user_id', userId);
    if (error) throw error;
    type Row = { repositories: { id: string; full_name: string; installation_id: string | null; last_synced_at: string | null; data_since: string | null } };
    return (data as unknown as Row[])
      .map(({ repositories: r }) => ({
        id: r.id,
        fullName: r.full_name,
        installationId: r.installation_id,
        lastSyncedAt: r.last_synced_at,
        dataSince: r.data_since,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  },

  async periodMetrics(ids: string[], from: Date, to: Date): Promise<{ metrics: PeriodMetrics; commitStatsCoverage: number | null }> {
    const { data, error } = await supabase.rpc('repositories_period_metrics', range(ids, from, to));
    if (error) throw error;
    return toPeriodMetrics((data as PeriodMetricsRow[])[0]);
  },

  async members(ids: string[], from: Date, to: Date): Promise<TeamMemberActivity[]> {
    const { data, error } = await supabase.rpc('members_activity', range(ids, from, to));
    if (error) throw error;
    return (data as MemberRow[]).map((r) => ({
      githubId: num(r.github_id),
      login: r.login,
      avatarUrl: r.avatar_url,
      repositories: num(r.repositories),
      commits: num(r.commits),
      prsOpened: num(r.prs_opened),
      prsMerged: num(r.prs_merged),
      reviews: num(r.reviews),
      additions: num(r.additions),
      deletions: num(r.deletions),
      lastActiveAt: r.last_active_at,
      weeklyActivity: (r.weekly_activity ?? []).map(num),
    }));
  },

  async breakdown(ids: string[], from: Date, to: Date) {
    const { data, error } = await supabase.rpc('repositories_breakdown', range(ids, from, to));
    if (error) throw error;
    return (data as BreakdownRow[]).map((r) => ({
      repositoryId: r.repository_id,
      prThroughput: num(r.pr_throughput),
      prsOpened: num(r.prs_opened),
      cycleTime: numOrNull(r.cycle_time),
      reviewCount: num(r.review_count),
      commitCount: num(r.commit_count),
      codeChurn: num(r.code_churn),
      activeContributors: num(r.active_contributors),
    }));
  },

  /** Daily series for [fromDate, toDate] (UTC dates, inclusive), oldest first. */
  async dailyTrends(ids: string[], fromDate: string, toDate: string): Promise<DailyTrend[]> {
    const { data, error } = await supabase.rpc('repositories_daily_metrics', {
      p_repository_ids: ids,
      p_from: fromDate,
      p_to: toDate,
    });
    if (error) throw error;
    return (data as DailyRow[]).map((r) => ({
      date: r.metric_date,
      prsOpened: num(r.prs_opened),
      prThroughput: num(r.pr_throughput),
      cycleTime: numOrNull(r.cycle_time),
      firstReviewTime: numOrNull(r.first_review_time),
      reviewDelay: numOrNull(r.review_delay),
      prSize: numOrNull(r.pr_size),
      codeChurn: num(r.code_churn),
      commitCount: num(r.commit_count),
      reviewCount: num(r.review_count),
      activeContributors: num(r.active_contributors),
    }));
  },
};
