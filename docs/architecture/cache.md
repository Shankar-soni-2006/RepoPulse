# Cache (Upstash Redis)

Redis is **optional** and **never authoritative**. Supabase is the source of truth; the
cache only saves repeated analytics queries.

Code: `backend/src/services/cache/cacheService.ts`.

## What is cached

| Key | Endpoint |
|---|---|
| `repo:{id}:overview:{days}` | `GET /api/repositories/:id/metrics` |
| `repo:{id}:analytics:{days}` | `GET /api/repositories/:id/analytics` |
| `repo:{id}:contributors:{days}` | `GET /api/repositories/:id/contributors` |

`days` is 7, 30 or 90. The PR list isn't cached: it varies with filters and pages, and is
a single indexed query.

Responses carry `X-Cache: HIT | MISS | BYPASS`.

## Freshness

- **Invalidation:** the repository's 9 keys are deleted after every sync (successful or
  failed, since a failed sync may have written part of its data) and after every webhook
  that updates data.
- **TTL: 10 minutes.** Periods end "now", so an entry describes a window that slowly
  moves; the TTL bounds that drift even when nothing changes.

## Failure behavior

| Situation | Result |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` unset | Cache disabled; every request reads the database (`BYPASS`) |
| A read slower than 1 s, or erroring | That request reads the database (`BYPASS`); a warning is logged |
| Write to Redis fails | The fresh value is still returned (`MISS`) |
| Invalidation fails | Retried (3 attempts, 3 s each). If it still fails, an error is logged and the stale entry expires within the TTL |

Reads use `retry: false` and a 1 s per-request abort, so a degraded cache adds at most
1 s to a request. That leaves room for a cold TLS reconnect to Upstash after idle periods;
500 ms proved too tight right after syncs. Invalidation runs in the background with a 3 s
abort and up to 3 attempts, because a missed invalidation serves pre-update numbers.

Observed in development: the first few reads after the backend starts, and occasionally
right after a sync, can exceed 1 s while the HTTPS connection to Upstash is re-established.
Those requests are served from the database (`BYPASS`) with correct data, and later reads
hit the cache. Verified live: `HIT → sync → MISS → HIT`.

## Security

Repository access is checked by route middleware **before** any cache read, so an entry
is only served to users who may see that repository. Redis credentials stay in
`backend/.env`.

`GET /api/health` reports `cache: ok | disabled | error`.
