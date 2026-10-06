import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb } from './pglite.js';

// Team view SQL (migration 009) on two repositories of one organization.
// alice works in both repositories (two contributor rows, one GitHub id), bob only in
// R1, dave only in R2. Expected numbers are derived by hand:
//
// repo PR  author created      merged       size  cycle
// R1   1   alice  09-01 00:00  09-01 10:00   100   10h  first review by bob 09-01 02:00 (2h)
// R1   2   bob    09-02 00:00  09-02 02:00    20    2h
// R2   3   alice  09-03 00:00  09-04 06:00   300   30h
// R2   4   dave   09-05 00:00  open            8
// Commits: alice R2 +50/-10 (09-03), dave R2 +5/-5 (09-05)

const R1 = '11111111-1111-4111-8111-000000000001';
const R2 = '11111111-1111-4111-8111-000000000002';
const ALICE_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALICE_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000001';
const DAVE = 'dddddddd-0000-4000-8000-000000000002';
const FROM = '2026-09-01T00:00:00Z';
const TO = '2026-09-08T00:00:00Z';
const BOTH = `array['${R1}', '${R2}']::uuid[]`;

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
// Postgres numeric arrives as text ("10"); convert numbers, keep ids, logins and dates as they are
const numeric = (r: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k,
      v === null || Array.isArray(v) || (typeof v === 'string' && !/^-?\d+(\.\d+)?$/.test(v)) ? v : Number(v),
    ]),
  );

const pr = (n: number, repo: string, author: string, login: string, created: string, merged: string | null, size: number, firstReview: string | null = null) =>
  `insert into pull_requests (id, github_id, repository_id, contributor_id, number, title, author_login, status,
     additions, deletions, created_at, updated_at, merged_at, closed_at, first_review_at)
   values ('00000000-0000-4000-9000-00000000000${n}', ${2000 + n}, '${repo}', '${author}', ${n}, 'PR ${n}', '${login}',
     '${merged ? 'merged' : 'open'}', ${size}, 0, '${created}', '${created}',
     ${merged ? `'${merged}'` : 'null'}, ${merged ? `'${merged}'` : 'null'}, ${firstReview ? `'${firstReview}'` : 'null'});`;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into repositories (id, github_id, name, full_name, owner) values
      ('${R1}', 11, 'api', 'acme/api', 'acme'), ('${R2}', 12, 'web', 'acme/web', 'acme');
    insert into contributors (id, github_id, repository_id, login) values
      ('${ALICE_1}', 1, '${R1}', 'alice'), ('${ALICE_2}', 1, '${R2}', 'alice'),
      ('${BOB}', 2, '${R1}', 'bob'), ('${DAVE}', 4, '${R2}', 'dave');
    ${pr(1, R1, ALICE_1, 'alice', '2026-09-01T00:00:00Z', '2026-09-01T10:00:00Z', 100, '2026-09-01T02:00:00Z')}
    ${pr(2, R1, BOB, 'bob', '2026-09-02T00:00:00Z', '2026-09-02T02:00:00Z', 20)}
    ${pr(3, R2, ALICE_2, 'alice', '2026-09-03T00:00:00Z', '2026-09-04T06:00:00Z', 300)}
    ${pr(4, R2, DAVE, 'dave', '2026-09-05T00:00:00Z', null, 8)}
    insert into reviews (github_id, pull_request_id, repository_id, contributor_id, reviewer_login, state, submitted_at)
      values (31, '00000000-0000-4000-9000-000000000001', '${R1}', '${BOB}', 'bob', 'approved', '2026-09-01T02:00:00Z');
    insert into commits (sha, repository_id, contributor_id, message, additions, deletions, is_merge, committed_at) values
      ('t1', '${R2}', '${ALICE_2}', 'm', 50, 10, false, '2026-09-03T00:00:00Z'),
      ('t2', '${R2}', '${DAVE}', 'm', 5, 5, false, '2026-09-05T00:00:00Z');
  `);
}, 60_000);

describe('team view SQL (migration 009)', () => {
  it('recomputes metrics over the combined repositories instead of adding them up', async () => {
    const [m] = (await rows(`select * from repositories_period_metrics(${BOTH}, '${FROM}', '${TO}')`)).map(numeric);
    expect(m).toMatchObject({
      pr_throughput: 3, // PRs 1, 2, 3
      prs_opened: 4,
      cycle_time: 10, // median of 10h, 2h, 30h, over all PRs together
      pr_size: 100, // median of 100, 20, 300
      first_review_time: 2,
      review_count: 1,
      commit_count: 2,
      code_churn: 70, // 60 + 10
      active_contributors: 3, // alice, bob, dave; adding per-repo counts would give 4
      open_prs_without_review: 1, // PR 4
    });
  });

  it('keeps the single-repository function identical to a one-element set', async () => {
    const [single] = await rows(`select * from repository_period_metrics('${R2}', '${FROM}', '${TO}')`);
    const [asSet] = await rows(`select * from repositories_period_metrics(array['${R2}']::uuid[], '${FROM}', '${TO}')`);
    expect(single).toEqual(asSet);
  });

  it('gives each person one row across repositories, alphabetically', async () => {
    const people = (await rows(
      `select login, repositories, prs_opened, prs_merged, reviews, commits, additions, deletions from members_activity(${BOTH}, '${FROM}', '${TO}')`,
    )).map(numeric);
    expect(people).toEqual([
      { login: 'alice', repositories: 2, prs_opened: 2, prs_merged: 2, reviews: 0, commits: 1, additions: 50, deletions: 10 },
      { login: 'bob', repositories: 1, prs_opened: 1, prs_merged: 1, reviews: 1, commits: 0, additions: 0, deletions: 0 },
      { login: 'dave', repositories: 1, prs_opened: 1, prs_merged: 0, reviews: 0, commits: 1, additions: 5, deletions: 5 },
    ]);
  });

  it('breaks the team metrics down per repository', async () => {
    const perRepo = (await rows(
      `select repository_id, pr_throughput, cycle_time, active_contributors from repositories_breakdown(${BOTH}, '${FROM}', '${TO}') order by repository_id`,
    )).map(numeric);
    expect(perRepo).toEqual([
      { repository_id: R1, pr_throughput: 2, cycle_time: 6, active_contributors: 2 }, // median of 10h, 2h
      { repository_id: R2, pr_throughput: 1, cycle_time: 30, active_contributors: 2 },
    ]);
  });

  it('produces a continuous daily series with the same definitions', async () => {
    const days = (await rows(
      `select metric_date::text as day, pr_throughput, prs_opened, active_contributors from repositories_daily_metrics(${BOTH}, '2026-09-01', '2026-09-07')`,
    )).map(numeric);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ day: '2026-09-01', pr_throughput: 1, prs_opened: 1, active_contributors: 2 }); // alice PR + bob review
    expect(days[3]).toEqual({ day: '2026-09-04', pr_throughput: 1, prs_opened: 0, active_contributors: 0 });
    expect(days[6]).toEqual({ day: '2026-09-07', pr_throughput: 0, prs_opened: 0, active_contributors: 0 });
  });
});
