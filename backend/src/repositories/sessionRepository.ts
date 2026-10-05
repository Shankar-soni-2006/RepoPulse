import { supabase } from '../config/supabase.js';
import type { Session, User } from '../types/index.js';

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  encrypted_access_token: string;
  access_token_expires_at: string | null;
  encrypted_refresh_token: string | null;
  refresh_token_expires_at: string | null;
  expires_at: string;
  last_seen_at: string;
  created_at: string;
}

interface SessionUserRow {
  id: string;
  github_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  role: User['role'];
  suspended_at: string | null;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    encryptedAccessToken: row.encrypted_access_token,
    accessTokenExpiresAt: row.access_token_expires_at,
    encryptedRefreshToken: row.encrypted_refresh_token,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
  };
}

export type SessionInsert = Omit<SessionRow, 'id' | 'last_seen_at' | 'created_at'>;
export type SessionTokenUpdate = Pick<
  SessionRow,
  'encrypted_access_token' | 'access_token_expires_at' | 'encrypted_refresh_token' | 'refresh_token_expires_at'
>;

export const sessionRepository = {
  async create(session: SessionInsert): Promise<Session> {
    const { data, error } = await supabase.from('sessions').insert(session).select().single();
    if (error) throw error;
    return toSession(data as SessionRow);
  },

  // Unexpired session plus its user, in one query
  async findValidByTokenHash(tokenHash: string): Promise<{ session: Session; user: User } | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, users!inner(id, github_id, login, name, avatar_url, role, suspended_at)')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as SessionRow & { users: SessionUserRow };
    return {
      session: toSession(row),
      user: {
        id: row.users.id,
        githubId: row.users.github_id,
        login: row.users.login,
        name: row.users.name,
        avatarUrl: row.users.avatar_url,
        role: row.users.role,
        suspendedAt: row.users.suspended_at,
      },
    };
  },

  async updateTokens(id: string, tokens: SessionTokenUpdate): Promise<void> {
    const { error } = await supabase.from('sessions').update(tokens).eq('id', id);
    if (error) throw error;
  },

  async touch(id: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteById(id: string): Promise<void> {
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteExpiredForUser(userId: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', userId)
      .lte('expires_at', new Date().toISOString());
    if (error) throw error;
  },
};
