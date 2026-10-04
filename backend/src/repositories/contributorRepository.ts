import { supabase } from '../config/supabase.js';
import { chunk } from '../utils/batch.js';

const UPSERT_BATCH = 500;
const PAGE_SIZE = 1000; // PostgREST's default max rows per request

// Contributors are repository-scoped GitHub identities. Activity is computed by the
// analytics engine (analyticsRepository.contributorActivity), never stored here.
export interface ContributorIdentity {
  github_id: number;
  repository_id: string;
  login: string;
  avatar_url: string | null;
}

export const contributorRepository = {
  async upsertIdentities(rows: ContributorIdentity[]): Promise<void> {
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
