import { supabase } from '../config/supabase.js';
import type { GitHubInstallation } from '../types/index.js';

interface InstallationRow {
  id: string;
  installation_id: number;
  app_id: number;
  account_login: string;
  account_type: 'User' | 'Organization';
}

function toInstallation(row: InstallationRow): GitHubInstallation {
  return {
    id: row.id,
    installationId: row.installation_id,
    accountLogin: row.account_login,
    accountType: row.account_type,
  };
}

export const installationRepository = {
  async upsert(installation: Omit<InstallationRow, 'id'>): Promise<GitHubInstallation> {
    const { data, error } = await supabase
      .from('github_installations')
      .upsert(installation, { onConflict: 'installation_id' })
      .select()
      .single();
    if (error) throw error;
    return toInstallation(data as InstallationRow);
  },

  async findById(id: string): Promise<GitHubInstallation | null> {
    const { data, error } = await supabase
      .from('github_installations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toInstallation(data as InstallationRow) : null;
  },

  async findForUser(userId: string): Promise<GitHubInstallation[]> {
    const { data, error } = await supabase
      .from('user_installations')
      .select('github_installations(*)')
      .eq('user_id', userId);
    if (error) throw error;
    return (data as unknown as { github_installations: InstallationRow | null }[])
      .map((r) => r.github_installations)
      .filter((r): r is InstallationRow => r !== null)
      .map(toInstallation)
      .sort((a, b) => a.accountLogin.localeCompare(b.accountLogin));
  },
};
