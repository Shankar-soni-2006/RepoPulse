# Repository synchronization

Code: `backend/src/services/sync/syncService.ts`.
Triggered by `POST /api/repositories/:id/sync` (returns **202** and the repository in
`syncing` state) or `npm run sync:repo -- <repositoryId>` (waits and prints a summary).

## Locking

`claim_repository_sync()` (migration 005) atomically moves the repository to `syncing`.
A second request gets **409 SYNC_IN_PROGRESS**. A claim older than 10 minutes counts as
abandoned (for example, the server restarted, or a serverless function was stopped at its
time limit) and can be reclaimed.

On Vercel the sync runs after the 202 response through `waitUntil`, inside the function's
300-second limit. Commit-stat fetching stops 180 seconds after the sync started; the
remaining commits are picked up by the next sync.

## Window

| Sync | Reads |
|---|---|
| First | Activity from the last `SYNC_LOOKBACK_DAYS` (default **180**: the 90-day views plus a comparison period) |
| Later | Activity updated since `last_synced_at − 1h` (the overlap absorbs clock skew) |

`last_synced_at` is set to the **start** time of the last successful sync. A failed sync
leaves it unchanged, so the next run re-reads the same window.

## Steps

1. Read repository metadata **by GitHub id**, so renames and transfers are followed.
2. List PRs sorted by `updated` (newest first), stopping at the window boundary.
3. For each PR: `pulls.get` (additions, deletions, changed files: the list omits them)
   and its reviews. 4 requests in parallel.
4. List default-branch commits since the window start.
5. Upsert contributor identities for every PR author, reviewer and linked commit author.
6. Upsert PRs with `review_count` and `first_review_at`, then reviews and new commits.
7. Backfill commit line stats (see below).
8. Mark the repository `idle` with `last_synced_at`, or `error` with a user-facing
   `sync_error`. Internal errors are logged, not shown.

Every write is idempotent on GitHub identity, so re-running a sync is always safe.

## Rules

- **First review** = earliest *submitted* review by someone **other than the PR author**.
  Pending reviews don't count. Dismissed reviews do, since they were submitted.
- Deleted GitHub accounts are recorded as `ghost` (GitHub's convention).
- Unknown review states are skipped, not mapped to a guess.
- Commit dates come from GitHub. A commit with no date fails normalization rather than
  getting an invented timestamp.

## Commit stats

GitHub's commit list has no line counts; each commit needs its own request. Commits are
inserted with `additions/deletions = NULL` (unknown, not zero) and backfilled newest first,
up to 1000 per sync and never below a 300-request rate-limit reserve. Each sync continues
the backfill; `commitStatsPending` in the summary shows what's left. Merge commits are
flagged (`is_merge`) so analytics can exclude them from churn.

## Data limitations (to surface in analytics and AI)

- Only the **default branch** is read for commits.
- Activity older than the first sync's lookback window is not imported.
- Commit stats may be partially backfilled on large repositories.
- Commits whose author email isn't linked to a GitHub account have no contributor.
