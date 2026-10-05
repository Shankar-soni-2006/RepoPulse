import { describe, it, expect, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb } from './pglite.js';

// Migration 008 on a real Postgres engine: the rules admin actions rely on.

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
let db: PGlite;

const query = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
const fails = async (sql: string) => {
  try {
    await db.query(sql);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

beforeEach(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into users (id, github_id, login, role) values
      ('${ALICE}', 1, 'alice', 'admin'),
      ('${BOB}', 2, 'bob', 'member');
    insert into sessions (user_id, token_hash, encrypted_access_token, expires_at)
      values ('${BOB}', 'hash-bob', 'enc', now() + interval '1 day');
  `);
});

describe('roles (migration 008)', () => {
  it('defaults new users to member and only allows admin/member', async () => {
    await db.exec(`insert into users (github_id, login) values (3, 'carol')`);
    expect((await query<{ role: string }>(`select role from users where login = 'carol'`))[0].role).toBe('member');
    expect(await fails(`update users set role = 'owner' where login = 'carol'`)).toMatch(/users_role_check/);
  });

  it('never removes the last active admin', async () => {
    expect(await fails(`select * from admin_set_role('${ALICE}', 'member')`)).toBe('LAST_ADMIN');
    await query(`select * from admin_set_role('${BOB}', 'admin')`);
    await query(`select * from admin_set_role('${ALICE}', 'member')`);
    expect(await query(`select login from users where role = 'admin'`)).toEqual([{ login: 'bob' }]);
  });

  it('suspension signs the user out everywhere and can be undone', async () => {
    await query(`select * from admin_set_suspended('${BOB}', true)`);
    expect(await query(`select count(*)::int n from sessions where user_id = '${BOB}'`)).toEqual([{ n: 0 }]);
    expect((await query<{ s: boolean }>(`select suspended_at is not null s from users where id = '${BOB}'`))[0].s).toBe(true);
    await query(`select * from admin_set_suspended('${BOB}', false)`);
    expect((await query<{ s: boolean }>(`select suspended_at is not null s from users where id = '${BOB}'`))[0].s).toBe(false);
  });

  it('protects admins from suspension and deletion until demoted', async () => {
    expect(await fails(`select * from admin_set_suspended('${ALICE}', true)`)).toBe('TARGET_IS_ADMIN');
    expect(await fails(`select admin_delete_user('${ALICE}')`)).toBe('TARGET_IS_ADMIN');
  });

  it('deleting a member removes their sessions and access but keeps repository data', async () => {
    await db.exec(`
      insert into github_installations (id, installation_id, app_id, account_login, account_type)
        values ('33333333-3333-4333-8333-333333333333', 9, 1, 'bob', 'User');
      insert into repositories (id, github_id, name, full_name, owner, installation_id)
        values ('44444444-4444-4444-8444-444444444444', 7, 'r', 'bob/r', 'bob', '33333333-3333-4333-8333-333333333333');
      insert into user_repositories (user_id, repository_id) values ('${BOB}', '44444444-4444-4444-8444-444444444444');
    `);
    expect(await query(`select admin_delete_user('${BOB}') as deleted`)).toEqual([{ deleted: true }]);
    expect(await query(`select count(*)::int n from sessions`)).toEqual([{ n: 0 }]);
    expect(await query(`select count(*)::int n from user_repositories`)).toEqual([{ n: 0 }]);
    expect(await query(`select count(*)::int n from repositories`)).toEqual([{ n: 1 }]);
  });

  it('summarizes users and the system for the admin page', async () => {
    const [bob] = await query<{ login: string; repository_count: number; active_sessions: number }>(
      `select login, repository_count::int, active_sessions::int from admin_list_users() where login = 'bob'`,
    );
    expect(bob).toEqual({ login: 'bob', repository_count: 0, active_sessions: 1 });
    const [o] = await query<{ users: number; admins: number; active_sessions: number }>(
      `select users::int, admins::int, active_sessions::int from admin_overview()`,
    );
    expect(o).toEqual({ users: 2, admins: 1, active_sessions: 1 });
  });
});
