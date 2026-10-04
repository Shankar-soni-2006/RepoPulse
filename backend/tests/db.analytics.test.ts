import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb } from './pglite.js';

// Analytics SQL functions against a hand-built fixture. Every expected number
// below is derived by hand from the fixture, so these tests pin the definitions.
//
// Period P = [2026-09-01, 2026-09-08)  (7 days)
//
// PR  author  created      first review       merged        size  in P?
// 1   alice   09-01 00:00  09-01 02:00 (bob)   09-01 10:00   120   merged, cycle 10h, frt 2h
// 2   bob     09-02 00:00  09-02 06:00 (carol) 09-03 00:00    40   merged, cycle 24h, frt 6h
// 3   alice   09-05 00:00  —                   09-05 04:00   500   merged, cycle 4h
// 4   carol   09-06 00:00  —                   open                open, unreviewed (48h at end of P)
// 5   bob     08-25 00:00  —                   08-26 00:00    10   outside P
// 6   carol   09-03 00:00  09-04 00:00 (alice) open                frt 24h
//
// Reviews: alice self-comment on PR1 (ignored), bob pending on PR4 (ignored).
// Commits: c1 alice +100/-20, c2 bob +30/-10, c3 alice MERGE +500, c4 alice +500,
//          c5 unlinked author with unknown stats, c6 bob before P.

const R = '33333333-3333-4333-8333-333333333333';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FROM = '2026-09-01T00:00:00Z';
const TO = '2026-09-08T00:00:00Z';

let db: PGlite;

const pr = (n: number, author: string, login: string, created: string, merged: string | null, firstReview: string | null, add: number, del: number) =>
  `insert into pull_requests (id, github_id, repository_id, contributor_id, number, title, author_login, status,
     additions, deletions, created_at, updated_at, merged_at, closed_at, first_review_at)
   values ('00000000-0000-4000-8000-00000000000${n}', ${1000 + n}, '${R}', '${author}', ${n}, 'PR ${n}', '${login}',
     '${merged ? 'merged' : 'open'}', ${add}, ${del}, '${created}', '${created}',
     ${merged ? `'${merged}'` : 'null'}, ${merged ? `'${merged}'` : 'null'}, ${firstReview ? `'${firstReview}'` : 'null'});`;

const review = (id: number, prN: number, reviewer: string, login: string, state: string, at: string | null) =>
  `insert into reviews (github_id, pull_request_id, repository_id, contributor_id, reviewer_login, state, submitted_at)
   values (${id}, '00000000-0000-4000-8000-00000000000${prN}', '${R}', '${reviewer}', '${login}', '${state}', ${at ? `'${at}'` : 'null'});`;

const commit = (sha: string, author: string | null, at: string, add: number | null, del: number | null, merge = false) =>
  `insert into commits (sha, repository_id, contributor_id, author_login, message, additions, deletions, is_merge, committed_at)
   values ('${sha}', '${R}', ${author ? `'${author}'` : 'null'}, null, 'm', ${add ?? 'null'}, ${del ?? 'null'}, ${merge}, '${at}');`;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into repositories (id, github_id, name, full_name, owner) values ('${R}', 1, 'api', 'acme/api', 'acme');
    insert into contributors (id, github_id, repository_id, login) values
      ('${A}', 1, '${R}', 'alice'), ('${B}', 2, '${R}', 'bob'), ('${C}', 3, '${R}', 'carol');
    ${pr(1, A, 'alice', '2026-09-01T00:00:00Z', '2026-09-01T10:00:00Z', '2026-09-01T02:00:00Z', 100, 20)}
    ${pr(2, B, 'bob', '2026-09-02T00:00:00Z', '2026-09-03T00:00:00Z', '2026-09-02T06:00:00Z', 30, 10)}
    ${pr(3, A, 'alice', '2026-09-05T00:00:00Z', '2026-09-05T04:00:00Z', null, 500, 0)}
    ${pr(4, C, 'carol', '2026-09-06T00:00:00Z', null, null, 5, 5)}
    ${pr(5, B, 'bob', '2026-08-25T00:00:00Z', '2026-08-26T00:00:00Z', null, 5, 5)}
    ${pr(6, C, 'carol', '2026-09-03T00:00:00Z', null, '2026-09-04T00:00:00Z', 5, 5)}
    ${review(10, 1, A, 'alice', 'commented', '2026-09-01T01:00:00Z')}
    ${review(11, 1, B, 'bob', 'approved', '2026-09-01T02:00:00Z')}
    ${review(12, 2, C, 'carol', 'approved', '2026-09-02T06:00:00Z')}
    ${review(13, 6, A, 'alice', 'commented', '2026-09-04T00:00:00Z')}
    ${review(14, 4, B, 'bob', 'pending', null)}
    ${commit('c1', A, '2026-09-01T00:00:00Z', 100, 20)}
    ${commit('c2', B, '2026-09-02T00:00:00Z', 30, 10)}
    ${commit('c3', A, '2026-09-05T04:00:00Z', 500, 0, true)}
    ${commit('c4', A, '2026-09-05T03:00:00Z', 500, 0)}
    ${commit('c5', null, '2026-09-06T00:00:00Z', null, null)}
    ${commit('c6', B, '2026-08-30T00:00:00Z', 7, 7)}
  `);
}, 60_000);

describe('repository_period_metrics', () => {
  it('computes every metric for the period from the facts', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select * from repository_period_metrics('${R}', '${FROM}', '${TO}')`,
    );
    const m = Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, v === null ? null : Number(v)]));
    expect(m).toEqual({
      pr_throughput: 3, // PRs 1, 2, 3
      prs_opened: 5, // PRs 1, 2, 3, 4, 6
      cycle_time: 10, // median of 10h, 24h, 4h
      first_review_time: 6, // median of 2h, 6h, 24h
      review_delay: 32 / 3, // mean of 2h, 6h, 24h
      pr_size: 120, // median of 120, 40, 500
      code_churn: 660, // c1 120 + c2 40 + c4 500 (merge c3 and unknown c5 excluded)
      additions: 630,
      deletions: 30,
      commit_count: 5, // c1–c5
      commits_missing_stats: 1, // c5
      review_count: 3, // bob, carol, alice (self-review and pending excluded)
      active_contributors: 3,
      open_prs_without_review: 1, // PR 4
      oldest_unreviewed_wait: 48,
      commit_stats_coverage: 0.75, // c1, c2, c4 known of 4 non-merge commits
    });
  });

  it('returns nulls, not zeros, for medians when nothing qualifies', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select * from repository_period_metrics('${R}', '2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z')`,
    );
    expect(rows[0]).toMatchObject({
      pr_throughput: 0,
      cycle_time: null,
      first_review_time: null,
      review_delay: null,
      pr_size: null,
      commit_count: 0,
    });
  });
});

describe('contributor_activity', () => {
  it('summarises each contributor alphabetically with a weekly series', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select login, commits, prs_opened, prs_merged, reviews, additions, deletions, last_active_at, weekly_activity
         from contributor_activity('${R}', '${FROM}', '${TO}')`,
    );
    const normalized = rows.map((r) => ({
      ...r,
      additions: Number(r.additions),
      deletions: Number(r.deletions),
      last_active_at: (r.last_active_at as Date).toISOString(),
    }));
    expect(normalized).toEqual([
      { login: 'alice', commits: 3, prs_opened: 2, prs_merged: 2, reviews: 1, additions: 600, deletions: 20,
        last_active_at: '2026-09-05T04:00:00.000Z', weekly_activity: [6] },
      { login: 'bob', commits: 1, prs_opened: 1, prs_merged: 1, reviews: 1, additions: 30, deletions: 10,
        last_active_at: '2026-09-03T00:00:00.000Z', weekly_activity: [3] },
      { login: 'carol', commits: 0, prs_opened: 2, prs_merged: 0, reviews: 1, additions: 0, deletions: 0,
        last_active_at: '2026-09-06T00:00:00.000Z', weekly_activity: [3] },
    ]);
  });

  it('buckets activity into weeks across a longer period', async () => {
    const { rows } = await db.query<{ login: string; weekly_activity: number[] }>(
      `select login, weekly_activity from contributor_activity('${R}', '2026-08-25T00:00:00Z', '${TO}')`,
    );
    // Week 1 = 08-25..08-31: bob opened PR5 and committed c6
    expect(rows.find((r) => r.login === 'bob')?.weekly_activity).toEqual([2, 3]);
  });
});

describe('refresh_daily_metrics', () => {
  it('writes one row per day, zeros included, and is idempotent', async () => {
    const written = await db.query<{ n: number }>(`select refresh_daily_metrics('${R}', '2026-09-01', '2026-09-07') as n`);
    expect(written.rows[0].n).toBe(7);
    await db.query(`select refresh_daily_metrics('${R}', '2026-09-01', '2026-09-07')`);

    const { rows } = await db.query<Record<string, unknown>>(
      `select metric_date::text as day, prs_opened, pr_throughput, cycle_time_hours, first_review_time_hours,
              commit_count, code_churn, review_count, active_contributors
         from daily_metrics where repository_id = '${R}' order by metric_date`,
    );
    expect(rows).toHaveLength(7);
    expect({ ...rows[0], cycle_time_hours: Number(rows[0].cycle_time_hours), first_review_time_hours: Number(rows[0].first_review_time_hours) }).toEqual({
      day: '2026-09-01',
      prs_opened: 1,
      pr_throughput: 1,
      cycle_time_hours: 10,
      first_review_time_hours: 2,
      commit_count: 1,
      code_churn: 120,
      review_count: 1, // bob; alice's self-comment excluded
      active_contributors: 2, // alice (commit, PR), bob (review)
    });
    expect(rows[6]).toMatchObject({ day: '2026-09-07', prs_opened: 0, pr_throughput: 0, commit_count: 0, cycle_time_hours: null });
  });
});
