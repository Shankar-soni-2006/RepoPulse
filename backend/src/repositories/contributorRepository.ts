import { supabase } from '../config/supabase';
import type { Contributor } from '../types';

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

  async findByLogin(repositoryId: string, login: string): Promise<Contributor | null> {
    const { data, error } = await supabase
      .from('contributors')
      .select('*')
      .eq('repository_id', repositoryId)
      .eq('login', login)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toContributor(data as ContributorRow);
  },

  async upsertMany(
    contributors: Omit<ContributorRow, 'id' | 'created_at' | 'updated_at'>[],
  ): Promise<void> {
    if (contributors.length === 0) return;
    const { error } = await supabase
      .from('contributors')
      .upsert(contributors, { onConflict: 'github_id,repository_id' });
    if (error) throw error;
  },

  async incrementReviewCount(repositoryId: string, login: string): Promise<void> {
    const contributor = await this.findByLogin(repositoryId, login);
    if (!contributor) return;
    const { error } = await supabase
      .from('contributors')
      .update({ review_count: contributor.reviewCount + 1 })
      .eq('id', contributor.id);
    if (error) throw error;
  },
};
