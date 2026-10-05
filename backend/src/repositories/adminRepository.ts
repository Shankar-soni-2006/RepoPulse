import { supabase } from '../config/supabase.js';
import type { AdminOverview, AdminUser, UserRole } from '../types/index.js';
import { AppError, NotFoundError } from '../utils/errors.js';

// Calls the admin SQL functions (migration 008). The functions enforce the rules that
// must hold under concurrency (never remove the last admin; admins can't be suspended
// or deleted) and raise one of these codes.
const RULE_ERRORS: Record<string, () => AppError> = {
  LAST_ADMIN: () => new AppError('LAST_ADMIN', 'RepoPulse needs at least one active admin', 409),
  TARGET_IS_ADMIN: () =>
    new AppError('TARGET_IS_ADMIN', 'Admins can’t be suspended or deleted. Change their role to member first', 409),
  INVALID_ROLE: () => new AppError('VALIDATION_ERROR', 'Role must be admin or member', 400),
};

function throwRuleError(error: { message?: string }): never {
  const rule = error.message ? RULE_ERRORS[error.message] : undefined;
  if (rule) throw rule();
  throw error;
}

interface AdminUserRow {
  id: string;
  github_id: number | string;
  login: string;
  name: string | null;
  avatar_url: string | null;
  role: UserRole;
  suspended_at: string | null;
  created_at: string;
  last_active_at: string | null;
  repository_count: number | string;
  active_sessions: number | string;
}

const toAdminUser = (r: AdminUserRow): AdminUser => ({
  id: r.id,
  githubId: Number(r.github_id),
  login: r.login,
  name: r.name,
  avatarUrl: r.avatar_url,
  role: r.role,
  suspendedAt: r.suspended_at,
  createdAt: r.created_at,
  lastActiveAt: r.last_active_at,
  repositoryCount: Number(r.repository_count),
  activeSessions: Number(r.active_sessions),
});

export const adminRepository = {
  async overview(): Promise<AdminOverview> {
    const { data, error } = await supabase.rpc('admin_overview').single();
    if (error) throw error;
    const r = data as Record<string, number | string>;
    return {
      users: Number(r.users),
      admins: Number(r.admins),
      suspended: Number(r.suspended),
      newUsers7d: Number(r.new_users_7d),
      activeSessions: Number(r.active_sessions),
      repositories: Number(r.repositories),
      syncedRepositories: Number(r.synced_repositories),
      failedSyncs: Number(r.failed_syncs),
      webhookFailures24h: Number(r.webhook_failures_24h),
    };
  },

  async listUsers(): Promise<AdminUser[]> {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw error;
    return (data as AdminUserRow[]).map(toAdminUser);
  },

  async setRole(userId: string, role: UserRole): Promise<void> {
    const { data, error } = await supabase.rpc('admin_set_role', { p_user_id: userId, p_role: role });
    if (error) throwRuleError(error);
    if (!(data as unknown[] | null)?.length) throw new NotFoundError('User');
  },

  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    const { data, error } = await supabase.rpc('admin_set_suspended', { p_user_id: userId, p_suspended: suspended });
    if (error) throwRuleError(error);
    if (!(data as unknown[] | null)?.length) throw new NotFoundError('User');
  },

  async deleteUser(userId: string): Promise<void> {
    const { data, error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
    if (error) throwRuleError(error);
    if (data !== true) throw new NotFoundError('User');
  },
};
