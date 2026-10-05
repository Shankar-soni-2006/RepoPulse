import { supabase } from '../config/supabase.js';
import type { User } from '../types/index.js';

interface UserRow {
  id: string;
  github_id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: User['role'];
  suspended_at: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: row.role,
    suspendedAt: row.suspended_at,
  };
}

export const userRepository = {
  /** Role and suspension are never touched here: only admins change them. */
  async upsertFromGitHub(user: Omit<UserRow, 'id' | 'role' | 'suspended_at'>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .upsert(user, { onConflict: 'github_id' })
      .select()
      .single();
    if (error) throw error;
    return toUser(data as UserRow);
  },

  async findByLogin(login: string): Promise<User | null> {
    const { data, error } = await supabase.from('users').select().ilike('login', login).maybeSingle();
    if (error) throw error;
    return data ? toUser(data as UserRow) : null;
  },
};
