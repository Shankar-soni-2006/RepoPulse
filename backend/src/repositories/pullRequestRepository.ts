import { supabase } from '../config/supabase.js';
import type { Paginated, PullRequest, PullRequestListQuery, PullRequestSort } from '../types/index.js';
import { chunk } from '../utils/batch.js';

const UPSERT_BATCH = 200; // PR bodies can be large

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
  // Generated columns (computed by Postgres, read-only)
  cycle_time: number | null;
  first_review_time: number | null;
  pr_size: number;
  // GitHub timestamps
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  synced_at: string;
}

// Columns the app writes; generated columns and bookkeeping are excluded
export type PullRequestInsert = Omit<
  PullRequestRow,
  'id' | 'cycle_time' | 'first_review_time' | 'pr_size' | 'synced_at'
>;

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

export type PRFilters = PullRequestListQuery;

const SORT_COLUMNS: Record<PullRequestSort, string> = {
  created: 'created_at',
  updated: 'updated_at',
  merged: 'merged_at',
  firstReview: 'first_review_at',
  cycleTime: 'cycle_time',
  prSize: 'pr_size',
  reviewCount: 'review_count',
  number: 'number',
};

// Literal match: escape LIKE wildcards and the escape character itself
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const pullRequestRepository = {
  findPeriodEvidence: (...args: Parameters<typeof findPeriodEvidence>) => findPeriodEvidence(...args),

  async findByRepository(
    repositoryId: string,
    filters: PRFilters = {},
  ): Promise<Paginated<PullRequest>> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 25, 100);
    const from = (page - 1) * limit;

    let query = supabase
      .from('pull_requests')
      .select('*', { count: 'exact' })
      .eq('repository_id', repositoryId)
      // Rows without a value for the sort column (e.g. unmerged PRs by merge date) go last
      .order(SORT_COLUMNS[filters.sort ?? 'created'], { ascending: filters.order === 'asc', nullsFirst: false })
      .order('number', { ascending: false })
      .range(from, from + limit - 1);

    if (filters.status) query = query.eq('status', filters.status);
    const search = filters.search?.trim();
    if (search) {
      const asNumber = /^#?(\d+)$/.exec(search);
      query = asNumber
        ? query.eq('number', Number(asNumber[1]))
        : query.ilike('title', `%${escapeLike(search)}%`);
    }
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

  /** Idempotent on (github_id, repository_id). Returns GitHub PR id → RepoPulse id. */
  async upsertMany(prs: PullRequestInsert[]): Promise<Map<number, string>> {
    const ids = new Map<number, string>();
    for (const batch of chunk(prs, UPSERT_BATCH)) {
      const { data, error } = await supabase
        .from('pull_requests')
        .upsert(batch, { onConflict: 'github_id,repository_id' })
        .select('id, github_id');
      if (error) throw error;
      for (const row of data as { id: string; github_id: number }[]) ids.set(row.github_id, row.id);
    }
    return ids;
  },

};

export interface PullRequestEvidence {
  number: number;
  title: string;
  prSize: number;
  /** hours */
  cycleTime: number | null;
  /** hours */
  firstReviewTime: number | null;
  reviewCount: number;
  createdAt: string;
  mergedAt: string | null;
}

interface EvidenceRow {
  number: number;
  title: string;
  pr_size: number;
  cycle_time: number | string | null;
  first_review_time: number | string | null;
  review_count: number;
  created_at: string;
  merged_at: string | null;
}

const EVIDENCE_COLUMNS = 'number, title, pr_size, cycle_time, first_review_time, review_count, created_at, merged_at';

function toEvidence(r: EvidenceRow): PullRequestEvidence {
  return {
    number: r.number,
    title: r.title,
    prSize: Number(r.pr_size),
    cycleTime: r.cycle_time === null ? null : Number(r.cycle_time),
    firstReviewTime: r.first_review_time === null ? null : Number(r.first_review_time),
    reviewCount: r.review_count,
    createdAt: r.created_at,
    mergedAt: r.merged_at,
  };
}

/** Specific PRs behind the aggregate metrics of a period, for AI evidence. No author data. */
export async function findPeriodEvidence(
  repositoryId: string,
  from: Date,
  to: Date,
  limit = 5,
): Promise<{ slowestMerged: PullRequestEvidence[]; largestMerged: PullRequestEvidence[]; awaitingReview: PullRequestEvidence[] }> {
  const merged = () =>
    supabase
      .from('pull_requests')
      .select(EVIDENCE_COLUMNS)
      .eq('repository_id', repositoryId)
      .gte('merged_at', from.toISOString())
      .lt('merged_at', to.toISOString());

  const [slowest, largest, waiting] = await Promise.all([
    merged().order('cycle_time', { ascending: false }).limit(limit),
    merged().order('pr_size', { ascending: false }).limit(limit),
    // Open at period end with no review yet, oldest first
    supabase
      .from('pull_requests')
      .select(EVIDENCE_COLUMNS)
      .eq('repository_id', repositoryId)
      .eq('status', 'open')
      .is('first_review_at', null)
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: true })
      .limit(limit),
  ]);
  for (const r of [slowest, largest, waiting]) if (r.error) throw r.error;

  return {
    slowestMerged: (slowest.data as EvidenceRow[]).map(toEvidence),
    largestMerged: (largest.data as EvidenceRow[]).map(toEvidence),
    awaitingReview: (waiting.data as EvidenceRow[]).map(toEvidence),
  };
}
