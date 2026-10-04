import { supabase } from '../config/supabase.js';
import type { Contributor } from '../types/index.js';
import { chunk } from '../utils/batch.js';

const UPSERT_BATCH = 500;
const PAGE_SIZE = 1000; // PostgREST's default max rows per request

interface ContributorRow {
  id: string;
  github_id: number;
  repository_id: string;
  login: string;
  avatar_url: string | null;
  name: string | null;
  commit_count: number;
  pull_request_count: number;
  review_count: number;
  additions: number;
  deletions: number;
  first_contribution_at: string | null;
  last_contribution_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ContributorIdentity = Pick<
  ContributorRow,
  'github_id' | 'repository_id' | 'login' | 'avatar_url'
>;

function toContributor(row: ContributorRow): Contributor {
  return {
    id: row.id,
    githubId: row.github_id,
    repositoryId: row.repository_id,
    login: row.login,
    avatarUrl: row.avatar_url,
    name: row.name,
    commitCount: row.commit_count,
    pullRequestCount: row.pull_request_count,
    reviewCount: row.review_count,
    additions: row.additions,
    deletions: row.deletions,
    firstContributionAt: row.first_contribution_at,
    lastContributionAt: row.last_contribution_at,
  };
}

export const contributorRepository = {
  async findByRepository(repositoryId: string): Promise<Contributor[]> {
    const { data, error } = await supabase
      .from('contributors')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('commit_count', { ascending: false });
    if (error) throw error;
    return (data as ContributorRow[]).map(toContributor);
  },

  async upsertIdentities(rows: ContributorIdentity[]): Promise<void> {
    // Identity columns only; activity counters are owned by the analytics engine
    for (const batch of chunk(rows, UPSERT_BATCH)) {
      const { error } = await supabase
        .from('contributors')
        .upsert(batch, { onConflict: 'github_id,repository_id' });
      if (error) throw error;
    }
  },

  /** GitHub user id → contributor id for every contributor in the repository */
  async findIdMap(repositoryId: string): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('contributors')
        .select('id, github_id')
        .eq('repository_id', repositoryId)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      for (const row of data as { id: string; github_id: number }[]) map.set(row.github_id, row.id);
      if (data.length < PAGE_SIZE) return map;
    }
  },
};
