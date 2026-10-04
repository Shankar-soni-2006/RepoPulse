import { supabase } from '../config/supabase.js';

// user ↔ installation and user ↔ repository access rows (authorization source of truth)

async function replaceSet(
  table: 'user_installations' | 'user_repositories',
  column: 'installation_id' | 'repository_id',
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length > 0) {
    const rows = ids.map((id) => ({ user_id: userId, [column]: id }));
    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: `user_id,${column}`, ignoreDuplicates: true });
    if (error) throw error;
  }

  // Revoke anything GitHub no longer grants this user. Diff in memory and delete in
  // chunks so large orgs don't produce oversized query strings.
  const { data, error } = await supabase.from(table).select(column).eq('user_id', userId);
  if (error) throw error;
  const keep = new Set(ids);
  const stale = (data as unknown as Record<string, string>[])
    .map((r) => r[column])
    .filter((id) => !keep.has(id));

  for (let i = 0; i < stale.length; i += DELETE_CHUNK) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .in(column, stale.slice(i, i + DELETE_CHUNK));
    if (deleteError) throw deleteError;
  }
}

const DELETE_CHUNK = 100;

export const accessRepository = {
  replaceUserInstallations(userId: string, installationIds: string[]): Promise<void> {
    return replaceSet('user_installations', 'installation_id', userId, installationIds);
  },

  replaceUserRepositories(userId: string, repositoryIds: string[]): Promise<void> {
    return replaceSet('user_repositories', 'repository_id', userId, repositoryIds);
  },

  async hasRepositoryAccess(userId: string, repositoryId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('user_repositories')
      .select('repository_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('repository_id', repositoryId);
    if (error) throw error;
    return (count ?? 0) > 0;
  },
};
