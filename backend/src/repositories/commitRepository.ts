import { supabase } from '../config/supabase';
import type { Commit } from '../types';
import { chunk } from '../utils/batch';

const UPSERT_BATCH = 500;

interface CommitRow {
  id: string;
  sha: string;
  repository_id: string;
  contributor_id: string | null;
  author_login: string | null;
  message: string;
  additions: number | null;
  deletions: number | null;
  is_merge: boolean;
  committed_at: string;
  created_at: string;
}

export type CommitInsert = Omit<CommitRow, 'id' | 'created_at'>;

function toCommit(row: CommitRow): Commit {
  return {
    id: row.id,
    sha: row.sha,
    repositoryId: row.repository_id,
    authorId: row.contributor_id,
    authorLogin: row.author_login,
    message: row.message,
    additions: row.additions,
    deletions: row.deletions,
    isMerge: row.is_merge,
    committedAt: row.committed_at,
    createdAt: row.created_at,
  };
}

export const commitRepository = {
  /**
   * Inserts commits not seen before. Commits are immutable, and existing rows may
   * already hold fetched stats that a list response (no stats) must not overwrite.
   */
  async insertNew(commits: CommitInsert[]): Promise<void> {
    for (const batch of chunk(commits, UPSERT_BATCH)) {
      const { error } = await supabase
        .from('commits')
        .upsert(batch, { onConflict: 'sha,repository_id', ignoreDuplicates: true });
      if (error) throw error;
    }
  },

  /** Newest commits still missing line stats, up to `limit`. */
  async findMissingStats(repositoryId: string, limit: number): Promise<CommitInsert[]> {
    if (limit <= 0) return [];
    const { data, error } = await supabase
      .from('commits')
      .select('sha, repository_id, contributor_id, author_login, message, additions, deletions, is_merge, committed_at')
      .eq('repository_id', repositoryId)
      .is('additions', null)
      .order('committed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as CommitInsert[];
  },

  async countMissingStats(repositoryId: string): Promise<number> {
    const { count, error } = await supabase
      .from('commits')
      .select('sha', { count: 'exact', head: true })
      .eq('repository_id', repositoryId)
      .is('additions', null);
    if (error) throw error;
    return count ?? 0;
  },

  /** Writes fetched stats back (full rows, so the upsert never nulls other columns). */
  async saveStats(commits: CommitInsert[]): Promise<void> {
    for (const batch of chunk(commits, UPSERT_BATCH)) {
      const { error } = await supabase
        .from('commits')
        .upsert(batch, { onConflict: 'sha,repository_id' });
      if (error) throw error;
    }
  },

  async findByDateRange(
    repositoryId: string,
    from: string,
    to: string,
  ): Promise<Commit[]> {
    const { data, error } = await supabase
      .from('commits')
      .select('*')
      .eq('repository_id', repositoryId)
      .gte('committed_at', from)
      .lte('committed_at', to)
      .order('committed_at', { ascending: true });
    if (error) throw error;
    return (data as CommitRow[]).map(toCommit);
  },
};
