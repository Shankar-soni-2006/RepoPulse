import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Applies every Supabase migration to an in-process Postgres (PGlite) and checks
// the integrity rules the backend relies on.

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const USER = '11111111-1111-4111-8111-111111111111';
const INSTALLATION = '22222222-2222-4222-8222-222222222222';
const REPO = '33333333-3333-4333-8333-333333333333';

function migration(file: string): string {
  // gen_random_uuid() is core since PG13; PGlite has no pgcrypto extension
  return readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(
    /create extension if not exists "pgcrypto";/i,
    '',
  );
}

let db: PGlite;

async function one<T>(sql: string): Promise<T> {
  return (await db.query<T>(sql)).rows[0];
}

function insertPr(githubId: number, extra: Record<string, string> = {}): string {
  const cols: Record<string, string> = {
    github_id: String(githubId),
    repository_id: `'${REPO}'`,
    number: String(githubId),
    title: `'PR ${githubId}'`,
    author_login: `'octo'`,
    created_at: `'2026-09-01T10:00:00Z'`,
    updated_at: `'2026-09-01T10:00:00Z'`,
    ...extra,
  };
  return `insert into pull_requests (${Object.keys(cols).join(', ')}) values (${Object.values(cols).join(', ')})`;
}

beforeAll(async () => {
  db = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const before004 = files.filter((f) => f < '004');
  const rest = files.filter((f) => f >= '004');

  for (const f of before004) await db.exec(migration(f));

  // Data shaped like the pre-004 schema, to prove 004 migrates it
  await db.exec(`
    insert into users (id, github_id, login) values ('${USER}', 1, 'octo');
    insert into github_installations (id, user_id, installation_id, app_id, account_login, account_type, access_token)
      values ('${INSTALLATION}', '${USER}', 99, 7, 'acme', 'Organization', 'plaintext');
  `);

  for (const f of rest) await db.exec(migration(f));

  await db.exec(`
    insert into repositories (id, github_id, installation_id, name, full_name, owner)
      values ('${REPO}', 500, '${INSTALLATION}', 'api', 'acme/api', 'acme');
  `);
}, 60_000);

describe('migration 004 data migration', () => {
  it('moves installation ownership into user_installations', async () => {
    const r = await one<{ n: number }>(`select count(*)::int n from user_installations`);
    expect(r.n).toBe(1);
  });

  it('removes token and owner columns from github_installations', async () => {
    const cols = (
      await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'github_installations'`,
      )
    ).rows.map((r) => r.column_name);
    expect(cols).not.toContain('access_token');
    expect(cols).not.toContain('user_id');
  });
});

describe('pull_requests', () => {
  it('derives cycle_time, first_review_time and pr_size from stored facts', async () => {
    await db.exec(
      insertPr(1000, {
        additions: '120',
        deletions: '30',
        first_review_at: `'2026-09-01T13:00:00Z'`,
        merged_at: `'2026-09-02T10:00:00Z'`,
      }),
    );
    const pr = await one<{ c: number; f: number; s: number }>(
      `select cycle_time::float c, first_review_time::float f, pr_size s from pull_requests where github_id = 1000`,
    );
    expect(pr).toEqual({ c: 24, f: 3, s: 150 });
  });

  it('upserts idempotently and keeps GitHub updated_at while advancing synced_at', async () => {
    await db.exec(insertPr(1100));
    const before = await one<{ synced_at: Date }>(`select synced_at from pull_requests where github_id = 1100`);
    await db.exec(`select pg_sleep(0.01)`);
    await db.exec(
      `${insertPr(1100, { updated_at: `'2026-09-03T08:00:00Z'`, additions: '5' })}
       on conflict (github_id, repository_id) do update set
         updated_at = excluded.updated_at, additions = excluded.additions`,
    );
    const after = await one<{ n: number; updated_at: Date; synced_at: Date; s: number }>(
      `select (select count(*)::int from pull_requests where github_id = 1100) n,
              updated_at, synced_at, pr_size s
         from pull_requests where github_id = 1100`,
    );
    expect(after.n).toBe(1);
    expect(after.updated_at.toISOString()).toBe('2026-09-03T08:00:00.000Z');
    expect(after.synced_at.getTime()).toBeGreaterThan(before.synced_at.getTime());
    expect(after.s).toBe(5);
  });

  it('rejects writes to generated columns', async () => {
    await expect(db.exec(insertPr(1200, { cycle_time: '5' }))).rejects.toThrow(/cycle_time/);
  });

  it('requires GitHub created_at', async () => {
    await expect(
      db.exec(
        `insert into pull_requests (github_id, repository_id, number, title, author_login, updated_at)
         values (1300, '${REPO}', 1300, 't', 'o', now())`,
      ),
    ).rejects.toThrow(/created_at/);
  });

  it('rejects negative line counts', async () => {
    await expect(db.exec(insertPr(1400, { additions: '-1' }))).rejects.toThrow(/additions_nonneg/);
  });
});

describe('reviews and commits', () => {
  it('accepts pending reviews without submitted_at', async () => {
    const { id } = await one<{ id: string }>(`select id from pull_requests where github_id = 1000`);
    await db.exec(
      `insert into reviews (github_id, pull_request_id, repository_id, reviewer_login, state, submitted_at)
       values (1, '${id}', '${REPO}', 'rev', 'pending', null)`,
    );
  });

  it('stores unknown commit stats as NULL, not 0', async () => {
    await db.exec(
      `insert into commits (sha, repository_id, message, committed_at) values ('abc', '${REPO}', 'm', now())`,
    );
    const c = await one<{ additions: number | null; deletions: number | null }>(
      `select additions, deletions from commits where sha = 'abc'`,
    );
    expect(c).toEqual({ additions: null, deletions: null });
  });

  it('rejects duplicate commits per repository', async () => {
    await expect(
      db.exec(`insert into commits (sha, repository_id, message, committed_at) values ('abc', '${REPO}', 'm', now())`),
    ).rejects.toThrow(/unique/i);
  });
});

describe('repositories', () => {
  it('allows a reused full_name (rename/transfer) but not a duplicate github_id', async () => {
    await db.exec(`insert into repositories (github_id, name, full_name, owner) values (501, 'api', 'acme/api', 'acme')`);
    await expect(
      db.exec(`insert into repositories (github_id, name, full_name, owner) values (500, 'x', 'acme/x', 'acme')`),
    ).rejects.toThrow(/unique/i);
  });
});

describe('webhook_events', () => {
  it('defaults status to received and dedupes deliveries', async () => {
    await db.exec(`insert into webhook_events (event_type, github_delivery_id) values ('push', 'd-1')`);
    const e = await one<{ status: string }>(`select status from webhook_events where github_delivery_id = 'd-1'`);
    expect(e.status).toBe('received');
    await expect(
      db.exec(`insert into webhook_events (event_type, github_delivery_id) values ('push', 'd-1')`),
    ).rejects.toThrow(/unique/i);
  });

  it('rejects unknown statuses', async () => {
    await expect(db.exec(`update webhook_events set status = 'done'`)).rejects.toThrow(/check/i);
  });
});

describe('access and sessions', () => {
  it('cascades sessions and access rows when a user is deleted', async () => {
    await db.exec(`
      insert into user_repositories (user_id, repository_id) values ('${USER}', '${REPO}');
      insert into sessions (user_id, token_hash, encrypted_access_token, expires_at)
        values ('${USER}', 'h1', 'enc', now() + interval '1 day');
    `);
    await expect(
      db.exec(
        `insert into sessions (user_id, token_hash, encrypted_access_token, expires_at)
         values ('${USER}', 'h1', 'enc', now())`,
      ),
    ).rejects.toThrow(/unique/i);

    await db.exec(`delete from users where id = '${USER}'`);
    const left = await one<{ s: number; r: number; i: number }>(
      `select (select count(*)::int from sessions) s,
              (select count(*)::int from user_repositories) r,
              (select count(*)::int from user_installations) i`,
    );
    expect(left).toEqual({ s: 0, r: 0, i: 0 });
  });
});

describe('schema hygiene', () => {
  it('has range indexes and no redundant ones', async () => {
    const idx = (
      await db.query<{ indexname: string }>(`select indexname from pg_indexes where schemaname = 'public'`)
    ).rows.map((r) => r.indexname);
    expect(idx).toEqual(
      expect.arrayContaining([
        'idx_pull_requests_repo_created',
        'idx_pull_requests_repo_merged',
        'idx_commits_repo_committed',
        'idx_reviews_repo_submitted',
      ]),
    );
    expect(idx).not.toContain('idx_users_github_id');
    expect(idx).not.toContain('idx_pull_requests_repository_id');
  });

  it('has no legacy views and RLS on every table', async () => {
    const views = await db.query(`select 1 from information_schema.views where table_schema = 'public'`);
    expect(views.rows).toHaveLength(0);
    const noRls = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(noRls.rows).toEqual([]);
  });
});
