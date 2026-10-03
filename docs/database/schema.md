# RepoPulse database schema

Supabase PostgreSQL. Aligned with the RepoPulse database specification document; intentional
differences (access tables, sessions, NULL-for-unknown commit stats, non-unique `full_name`,
generated PR metrics) are explained below. Migrations in `supabase/migrations/` are applied in filename order and
verified by `backend/tests/db.migrations.test.ts` (runs them against PGlite).

Only the backend touches the database, using the service-role key. Every table has RLS enabled
with deny-all policies, so the anon/authenticated keys can read nothing.

## Tables

| Table | Purpose | Identity / uniqueness |
|---|---|---|
| `users` | GitHub users who signed in | `github_id` unique |
| `sessions` | Server-side sessions. Stores a SHA-256 **hash** of the cookie token and the user's GitHub token **encrypted** | `token_hash` unique |
| `github_installations` | GitHub App installations (user or org accounts). No tokens stored — installation tokens are minted on demand | `installation_id` unique |
| `user_installations` | Which users can see which installations | PK `(user_id, installation_id)` |
| `repositories` | Repositories RepoPulse knows about (incl. `is_fork`, `is_archived`, `html_url`) + sync state: `sync_status` (`never` / `syncing` / `synced` / `failed`), `sync_error`, `sync_started_at`, `last_synced_at` | `github_id` unique (`full_name` is *not* — repos can be renamed/transferred) |
| `user_repositories` | Which users may access which repositories (authorization source) | PK `(user_id, repository_id)` |
| `contributors` | GitHub accounts active in a repository | `(github_id, repository_id)` unique |
| `pull_requests` | Pull requests | `(github_id, repository_id)` unique; `(repository_id, number)` unique |
| `reviews` | PR reviews | `(github_id, pull_request_id)` unique |
| `commits` | Commits | `(sha, repository_id)` unique |
| `daily_metrics` | Per-repository daily rollups written by the analytics engine | `(repository_id, date)` unique |
| `webhook_events` | Received GitHub webhook deliveries + processing state (`received` / `processing` / `processed` / `ignored` / `failed`) | `github_delivery_id` unique (dedupes redeliveries) |

## Integrity rules

- **GitHub timestamps.** `pull_requests.created_at` / `updated_at` are GitHub's values and have no
  default, so a sync that forgets them fails. `synced_at` records when RepoPulse last wrote the row.
- **Derived PR metrics are generated columns** (hours, `numeric`):
  - `cycle_time = merged_at − created_at` (NULL unless merged)
  - `first_review_time = first_review_at − created_at` (NULL until first review)
  - `pr_size = additions + deletions`

  The app cannot write them, so they can never drift from their inputs.
  The backend maintains `first_review_at` and `review_count` from `reviews`.
- **Unknown is NULL, not 0.** `commits.additions` / `deletions` are NULL when stats were not fetched
  (GitHub's commit list endpoint omits them). Analytics must not treat NULL as zero.
- **Pending reviews** have `submitted_at = NULL` and don't count toward first-review time.
- **Idempotent sync.** Every GitHub entity upserts on its GitHub identity (see table above).

## daily_metrics semantics

| Column | Meaning |
|---|---|
| `pr_count` | PRs opened that day |
| `merged_pr_count` | PRs merged that day |
| `commit_count`, `additions`, `deletions` | Commits authored that day |
| `review_count` | Reviews submitted that day |
| `avg_cycle_time` | Mean cycle time of PRs merged that day (hours) |
| `avg_first_review_time` | Mean first-review time of PRs first reviewed that day (hours) |
| `avg_pr_size` | Mean size of PRs opened that day |
| `active_contributors` | Distinct contributors with activity that day |

## Indexes

Foreign keys and time-range access are indexed. Range queries use composite indexes:
`pull_requests (repository_id, created_at)`, `pull_requests (repository_id, merged_at)`,
`commits (repository_id, committed_at)`, `reviews (repository_id, submitted_at)`.
Columns with unique constraints rely on the constraint's own index.
