import { supabase } from '../config/supabase';
import type { DailyMetric } from '../types';

interface DailyMetricRow {
  id: string;
  repository_id: string;
  date: string;
  pr_count: number;
  merged_pr_count: number;
  commit_count: number;
  additions: number;
  deletions: number;
  avg_cycle_time: number | null;
  avg_first_review_time: number | null;
  active_contributors: number;
  created_at: string;
  updated_at: string;
}

function toDailyMetric(row: DailyMetricRow): DailyMetric {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    date: row.date,
    prCount: row.pr_count,
    mergedPrCount: row.merged_pr_count,
    commitCount: row.commit_count,
    additions: row.additions,
    deletions: row.deletions,
    avgCycleTime: row.avg_cycle_time,
    avgFirstReviewTime: row.avg_first_review_time,
    activeContributors: row.active_contributors,
  };
}

export const dailyMetricRepository = {
  async findByDateRange(
    repositoryId: string,
    from: string,
    to: string,
  ): Promise<DailyMetric[]> {
    const { data, error } = await supabase
      .from('daily_metrics')
      .select('*')
      .eq('repository_id', repositoryId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data as DailyMetricRow[]).map(toDailyMetric);
  },

  async upsert(metric: Omit<DailyMetricRow, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const { error } = await supabase
      .from('daily_metrics')
      .upsert(metric, { onConflict: 'repository_id,date' });
    if (error) throw error;
  },

  async upsertMany(
    metrics: Omit<DailyMetricRow, 'id' | 'created_at' | 'updated_at'>[],
  ): Promise<void> {
    if (metrics.length === 0) return;
    const { error } = await supabase
      .from('daily_metrics')
      .upsert(metrics, { onConflict: 'repository_id,date' });
    if (error) throw error;
  },
};
