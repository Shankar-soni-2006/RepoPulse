import { supabase } from '../config/supabase.js';
import type { User } from '../types/index.js';

interface UserRow {
  id: string;
  github_id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
  };
}

export const userRepository = {
  async upsertFromGitHub(user: Omit<UserRow, 'id'>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .upsert(user, { onConflict: 'github_id' })
      .select()
      .single();
    if (error) throw error;
    return toUser(data as UserRow);
  },

};
