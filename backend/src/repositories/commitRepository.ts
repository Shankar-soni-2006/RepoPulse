import { supabase } from '../config/supabase';
import type { Commit } from '../types';

interface CommitRow {
  id: string;
  sha: string;
  repository_id: string;
  contributor_id: string | null;
  author_login: string | null;
  message: string;
  additions: number | null;
  deletions: number | null;
  committed_at: string;
  created_at: string;
}

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
    committedAt: row.committed_at,
    createdAt: row.created_at,
  };
}

export const commitRepository = {
  async upsertMany(
    commits: Omit<CommitRow, 'id' | 'created_at'>[],
  ): Promise<void> {
    if (commits.length === 0) return;
    const { error } = await supabase
      .from('commits')
      .upsert(commits, { onConflict: 'sha,repository_id' });
    if (error) throw error;
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
