# Analytics engine

The backend is authoritative for every metric. The frontend displays these values, and the
AI (Phase 9) interprets them; neither recalculates them.

Code: `supabase/migrations/007_analytics_engine.sql` (SQL functions),
`backend/src/repositories/analyticsRepository.ts`, `backend/src/services/analytics/analyticsService.ts`.
Tests: `backend/tests/db.analytics.test.ts` pins every definition against a hand-computed fixture.

## Definitions

Durations are **hours**; days are **UTC**; a period is `[from, to)`.

| Metric | Definition |
|---|---|
| PR throughput | PRs **merged** in the period |
| PRs opened | PRs created in the period |
| Cycle time | **Median** `merged_at − created_at` of PRs merged in the period |
| First review time | **Median** `first_review_at − created_at` of PRs first reviewed in the period |
| Review delay | **Mean** of the same values. The spec gives both metrics one formula; the mean adds information because long waits pull it up |
| PR size | **Median** `additions + deletions` of PRs merged in the period |
| Code churn | `additions + deletions` of **non-merge** commits with **known** stats |
| Commit count | Commits on the default branch in the period (merge commits included) |
| Review count | Submitted reviews, excluding authors reviewing their own PRs and pending reviews |
| Active contributors | Distinct contributors who committed, opened a PR or reviewed |
| Open PRs without review | PRs open at period end that had no review by then, and the oldest one's wait |

`first_review_at` is the earliest submitted review by someone other than the PR author
(see `sync.md`). Medians are `percentile_cont(0.5)`. When nothing qualifies, a median is
`null`, never 0.

## Comparison

Every result includes the previous period of equal length. `changes[metric]` is the
fractional change (`0.27` = +27%), or `null` when either side is unknown or the previous
value is 0.

## Data quality

`dataQuality` carries `dataSince` (earliest synced data), `lastSyncedAt`,
`commitStatsCoverage` (share of non-merge commits with known line stats), and
`limitations`: plain-language caveats such as "no PRs merged", "period older than imported
data" or "line counts missing". These are shown in the UI and passed to the AI.

## Contributors

`contributor_activity()` returns commits, PRs opened and merged, reviews, lines and a weekly
activity series per contributor, **alphabetically**. RepoPulse describes repository activity;
it never ranks people.

## Daily rollups

`refresh_daily_metrics()` writes one `daily_metrics` row per UTC day, zeros included, from
`data_since` to today. The daily values use the same definitions as the period values. It
runs after every successful sync (and will run after webhook updates in Phase 7).
Period metrics are always computed from the fact tables, because medians can't be built
from daily rollups.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/repositories/:id/metrics?days=7\|30\|90` | `MetricsSummary`: metrics, previous metrics, changes, data quality |
| `GET /api/repositories/:id/analytics?days=…` | `Analytics`: the summary plus `trends` (one row per UTC day) |
| `GET /api/repositories/:id/contributors?days=…` | `ContributorActivityReport` |

`days` defaults to 30.
