# Test report

Run 2026-10-04. Every scenario from the specification's Phase 12 is mapped to the tests
that cover it.

| Suite | Command | Result |
|---|---|---|
| Backend (unit, API, SQL on PGlite) | `npm --prefix backend test` | **211 passed**, 12 files |
| Frontend (components, pages, client) | `npm --prefix frontend test` | **36 passed**, 8 files |
| Live smoke test (real GitHub, Supabase, Upstash, Groq) | `npm run test:smoke` (backend running) | **16/16 passed** |
| Type checks (backend, tests, scripts, frontend) | `npm run typecheck` | clean |

`npm test` runs both automated suites.

## Layers

- **SQL:** migrations and analytics functions run on a real Postgres engine (PGlite).
  Metric definitions are pinned by a hand-computed fixture (`db.analytics.test.ts`).
- **API:** the real Express app via supertest, with the data-access layer mocked.
- **Services:** sync engine, webhook processor, cache and AI with GitHub, Redis and the
  AI provider simulated.
- **Frontend:** React components and pages in jsdom (Testing Library), API services
  mocked.
- **Live end to end:** `scripts/smoke-test.ts` drives the running backend against the
  real services. It uses a temporary session, re-delivers a signed webhook for an
  existing PR, and cleans up after itself.

Why the end-to-end layer is live rather than PGlite-backed: the backend talks to
Supabase through its PostgREST HTTP API, which can't sit in front of PGlite.

## Specification scenarios

| Scenario | Automated tests | Live (smoke) |
|---|---|---|
| **GitHub → Backend → Supabase** | `sync.test.ts`: windows, renames, contributors, review rules, stats backfill | Sync completes |
| **→ Analytics** | `db.analytics.test.ts` (exact SQL results), `analytics.test.ts` (comparison, limitations, endpoints) | Analytics returned |
| **→ Redis** | `cache.test.ts`: hit, miss, TTL, invalidation, retries | `MISS → HIT`; webhook invalidates |
| **→ AI** | `ai.test.ts`: provider request, fallback, grounding, caching, limits | Groq answer (cached) |
| **→ Frontend** | `MetricRow`, `TrendChart`, `InsightCard`, `PullRequestsPage`, `AIInsightsPage` tests | Pages checked in the browser (Phase 10) |
| **Webhook updates** | `webhooks.test.ts`: PR/review re-fetch, default-branch push, metric refresh range, cache invalidation | Signed delivery processed, PR re-fetched from GitHub |
| **Duplicate events** | `webhooks.test.ts` (route returns `duplicate`), `db.migrations.test.ts` (unique delivery id) | Redelivery not reprocessed |
| **Failed GitHub requests** | `failures.test.ts` (status → error-code mapping), `sync.test.ts` (rate limit recorded, missing commit skipped), `webhooks.test.ts` | — |
| **Database errors** | `failures.test.ts` (500 without details; session store down fails closed), `sync.test.ts`, `webhooks.test.ts` | — |
| **Redis failures** | `cache.test.ts` (read failure → database, write failure, invalidation retries, disabled) | — |
| **AI failures** | `ai.test.ts` (rate limited, outage, malformed answer, invented numbers, not configured); `AIInsightsPage.test.tsx` (messages) | — |
| **Invalid API input** | `api.foundation.test.ts` (ids, periods, status, malformed JSON), `api.pages.test.ts` (sort, dates, page size), `ai.test.ts` (modes, question) | Invalid period and id rejected |
| **Unauthorized requests** | `auth.test.ts` (every protected route, 404 without access, CSRF, OAuth state), `RequireAuth.test.tsx` | 401 without session; 403 without CSRF header |
| **Forged webhooks** | `webhooks.test.ts` (signature variants) | Forged signature rejected |

## Known issues

- **`npm audit` (frontend):** `braces` via Tailwind CSS 3, rated high. It runs at build
  time only on the project's own glob patterns and is never shipped to browsers. Every
  version is affected; the fix is a Tailwind 4 migration (deferred).
- **Vitest 5 quirk:** a `beforeEach` that touches a mock makes Vitest misreport handled
  rejections from that mock as test failures. The frontend config uses `clearMocks: true`
  instead of such hooks.

## Not covered by automation

- Real GitHub-originated PR/push webhooks; the smoke test sends its own signed delivery.
- Browser-level end-to-end tests (no Playwright); pages were exercised manually in
  Phases 10–11.
- Load and performance testing.
