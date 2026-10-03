import { supabase } from '../config/supabase';
import type { Repository } from '../types';

// ---- Row type (snake_case from DB) ----
interface RepositoryRow {
  id: string;
  github_id: number;
  installation_id: string | null;
  name: string;
  full_name: string;
  owner: string;
  description: string | null;
  visibility: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  sync_status: string;
  sync_error: string | null;
  sync_started_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RepositoryMetadata = Omit<
  RepositoryRow,
  'id' | 'created_at' | 'updated_at' | 'sync_status' | 'sync_error' | 'sync_started_at' | 'last_synced_at'
>;

function toRepository(row: RepositoryRow): Repository {
  return {
    id: row.id,
    githubId: row.github_id,
    name: row.name,
    fullName: row.full_name,
    owner: row.owner,
    description: row.description,
    visibility: row.visibility as Repository['visibility'],
    defaultBranch: row.default_branch,
    language: row.language,
    stargazersCount: row.stargazers_count,
    forksCount: row.forks_count,
    openIssuesCount: row.open_issues_count,
    syncStatus: row.sync_status as Repository['syncStatus'],
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const repositoryRepository = {
  // Only repositories the user has been granted via GitHub (user_repositories)
  async findAllForUser(userId: string): Promise<Repository[]> {
    const { data, error } = await supabase
      .from('repositories')
      .select('*, user_repositories!inner(user_id)')
      .eq('user_repositories.user_id', userId)
      .order('full_name');
    if (error) throw error;
    return (data as RepositoryRow[]).map(toRepository);
  },

  // Metadata only; returns the stored rows so callers get RepoPulse ids
  async upsertMany(repos: RepositoryMetadata[]): Promise<Repository[]> {
    if (repos.length === 0) return [];
    const { data, error } = await supabase
      .from('repositories')
      .upsert(repos, { onConflict: 'github_id' })
      .select();
    if (error) throw error;
    return (data as RepositoryRow[]).map(toRepository);
  },

  async findById(id: string): Promise<Repository | null> {
    const { data, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toRepository(data as RepositoryRow);
  },

  async findByGithubId(githubId: number): Promise<Repository | null> {
    const { data, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('github_id', githubId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toRepository(data as RepositoryRow);
  },

  // Metadata only — sync bookkeeping columns are owned by the mark* methods below
  async upsert(repo: RepositoryMetadata): Promise<Repository> {
    const { data, error } = await supabase
      .from('repositories')
      .upsert(repo, { onConflict: 'github_id' })
      .select()
      .single();
    if (error) throw error;
    return toRepository(data as RepositoryRow);
  },

  async markSyncStarted(id: string): Promise<void> {
    await this.update(id, {
      sync_status: 'syncing',
      sync_started_at: new Date().toISOString(),
      sync_error: null,
    });
  },

  async markSyncSucceeded(id: string, syncedAt: string): Promise<void> {
    await this.update(id, { sync_status: 'idle', last_synced_at: syncedAt, sync_error: null });
  },

  async markSyncFailed(id: string, message: string): Promise<void> {
    await this.update(id, { sync_status: 'error', sync_error: message.slice(0, 1000) });
  },

  async update(id: string, update: Partial<RepositoryRow>): Promise<void> {
    const { error } = await supabase.from('repositories').update(update).eq('id', id);
    if (error) throw error;
  },
};
