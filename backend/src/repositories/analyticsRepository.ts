import { supabase } from '../config/supabase.js';
import type { ContributorActivity, DailyTrend, PeriodMetrics } from '../types/index.js';

// Calls the analytics SQL functions (migration 007). Postgres numeric/bigint values
// may arrive as strings, so every number passes through num()/numOrNull().

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

interface PeriodMetricsRow {
  pr_throughput: number;
  prs_opened: number;
  cycle_time: number | string | null;
  first_review_time: number | string | null;
  review_delay: number | string | null;
  pr_size: number | string | null;
  code_churn: number | string;
  additions: number | string;
  deletions: number | string;
  commit_count: number;
  commits_missing_stats: number;
  review_count: number;
  active_contributors: number;
  open_prs_without_review: number;
  oldest_unreviewed_wait: number | string | null;
  commit_stats_coverage: number | string | null;
}

interface ContributorActivityRow {
  contributor_id: string;
  github_id: number | string;
  login: string;
  avatar_url: string | null;
  commits: number;
  prs_opened: number;
  prs_merged: number;
  reviews: number;
  additions: number | string;
  deletions: number | string;
  last_active_at: string | null;
  weekly_activity: number[] | null;
}

interface DailyMetricRow {
  metric_date: string;
  prs_opened: number;
  pr_throughput: number;
  cycle_time_hours: number | string | null;
  first_review_time_hours: number | string | null;
  review_delay_hours: number | string | null;
  pr_size_median: number | string | null;
  code_churn: number;
  commit_count: number;
  review_count: number;
  active_contributors: number;
}

export const analyticsRepository = {
  /** Metrics for [from, to), plus the share of non-merge commits with known line stats. */
  async periodMetrics(
    repositoryId: string,
    from: Date,
    to: Date,
  ): Promise<{ metrics: PeriodMetrics; commitStatsCoverage: number | null }> {
    const { data, error } = await supabase.rpc('repository_period_metrics', {
      p_repository_id: repositoryId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) throw error;
    const row = (data as PeriodMetricsRow[])[0];
    const metrics: PeriodMetrics = {
      prThroughput: num(row.pr_throughput),
      prsOpened: num(row.prs_opened),
      cycleTime: numOrNull(row.cycle_time),
      firstReviewTime: numOrNull(row.first_review_time),
      reviewDelay: numOrNull(row.review_delay),
      prSize: numOrNull(row.pr_size),
      codeChurn: num(row.code_churn),
      additions: num(row.additions),
      deletions: num(row.deletions),
      commitCount: num(row.commit_count),
      reviewCount: num(row.review_count),
      activeContributors: num(row.active_contributors),
      openPrsWithoutReview: num(row.open_prs_without_review),
      oldestUnreviewedWait: numOrNull(row.oldest_unreviewed_wait),
      commitsMissingStats: num(row.commits_missing_stats),
    };
    return { metrics, commitStatsCoverage: numOrNull(row.commit_stats_coverage) };
  },

  async contributorActivity(repositoryId: string, from: Date, to: Date): Promise<ContributorActivity[]> {
    const { data, error } = await supabase.rpc('contributor_activity', {
      p_repository_id: repositoryId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) throw error;
    return (data as ContributorActivityRow[]).map((r) => ({
      contributorId: r.contributor_id,
      githubId: num(r.github_id),
      login: r.login,
      avatarUrl: r.avatar_url,
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

  /** Recomputes daily rollups for [from, to] (UTC dates, YYYY-MM-DD, inclusive). */
  async refreshDailyMetrics(repositoryId: string, fromDate: string, toDate: string): Promise<number> {
    const { data, error } = await supabase.rpc('refresh_daily_metrics', {
      p_repository_id: repositoryId,
      p_from: fromDate,
      p_to: toDate,
    });
    if (error) throw error;
    return num(data);
  },

  /** Daily rollups for [from, to] (UTC dates, inclusive), oldest first. At most 91 rows. */
  async dailyTrends(repositoryId: string, fromDate: string, toDate: string): Promise<DailyTrend[]> {
    const { data, error } = await supabase
      .from('daily_metrics')
      .select(
        'metric_date, prs_opened, pr_throughput, cycle_time_hours, first_review_time_hours, review_delay_hours, pr_size_median, code_churn, commit_count, review_count, active_contributors',
      )
      .eq('repository_id', repositoryId)
      .gte('metric_date', fromDate)
      .lte('metric_date', toDate)
      .order('metric_date', { ascending: true });
    if (error) throw error;
    return (data as DailyMetricRow[]).map((r) => ({
      date: r.metric_date,
      prsOpened: num(r.prs_opened),
      prThroughput: num(r.pr_throughput),
      cycleTime: numOrNull(r.cycle_time_hours),
      firstReviewTime: numOrNull(r.first_review_time_hours),
      reviewDelay: numOrNull(r.review_delay_hours),
      prSize: numOrNull(r.pr_size_median),
      codeChurn: num(r.code_churn),
      commitCount: num(r.commit_count),
      reviewCount: num(r.review_count),
      activeContributors: num(r.active_contributors),
    }));
  },
};
