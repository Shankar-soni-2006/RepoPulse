import { supabase } from '../config/supabase';
import type { PullRequest } from '../types';

interface PullRequestRow {
  id: string;
  github_id: number;
  repository_id: string;
  contributor_id: string | null;
  number: number;
  title: string;
  body: string | null;
  author_login: string;
  status: string;
  labels: string[];
  additions: number;
  deletions: number;
  changed_files: number;
  review_count: number;
  first_review_at: string | null;
  cycle_time: number | null;
  first_review_time: number | null;
  pr_size: number;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

function toPullRequest(row: PullRequestRow): PullRequest {
  return {
    id: row.id,
    githubId: row.github_id,
    repositoryId: row.repository_id,
    number: row.number,
    title: row.title,
    body: row.body,
    authorId: row.contributor_id,
    authorLogin: row.author_login,
    status: row.status as PullRequest['status'],
    labels: row.labels ?? [],
    additions: row.additions,
    deletions: row.deletions,
    changedFiles: row.changed_files,
    reviewCount: row.review_count,
    firstReviewAt: row.first_review_at,
    cycleTime: row.cycle_time,
    firstReviewTime: row.first_review_time,
    prSize: row.pr_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mergedAt: row.merged_at,
    closedAt: row.closed_at,
  };
}

export interface PRFilters {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const pullRequestRepository = {
  async findByRepository(
    repositoryId: string,
    filters: PRFilters = {},
  ): Promise<{ items: PullRequest[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 25, 100);
    const from = (page - 1) * limit;

    let query = supabase
      .from('pull_requests')
      .select('*', { count: 'exact' })
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.search) query = query.ilike('title', `%${filters.search}%`);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);

    const { data, error, count } = await query;
    if (error) throw error;
    return {
      items: (data as PullRequestRow[]).map(toPullRequest),
      total: count ?? 0,
    };
  },

  async findById(id: string): Promise<PullRequest | null> {
    const { data, error } = await supabase
      .from('pull_requests')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toPullRequest(data as PullRequestRow);
  },

  async upsertMany(prs: Omit<PullRequestRow, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    if (prs.length === 0) return;
    const { error } = await supabase
      .from('pull_requests')
      .upsert(prs, { onConflict: 'github_id,repository_id' });
    if (error) throw error;
  },

  async updateReviewData(
    id: string,
    reviewCount: number,
    firstReviewAt: string | null,
  ): Promise<void> {
    const firstReviewTime =
      firstReviewAt
        ? null // calculated by analytics engine from DB
        : null;
    const { error } = await supabase
      .from('pull_requests')
      .update({ review_count: reviewCount, first_review_at: firstReviewAt, first_review_time: firstReviewTime })
      .eq('id', id);
    if (error) throw error;
  },

  async findByDateRange(
    repositoryId: string,
    from: string,
    to: string,
  ): Promise<PullRequest[]> {
    const { data, error } = await supabase
      .from('pull_requests')
      .select('*')
      .eq('repository_id', repositoryId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as PullRequestRow[]).map(toPullRequest);
  },
};
