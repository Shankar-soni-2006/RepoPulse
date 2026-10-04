# Acceptance criteria: status

Tracks the master specification's final acceptance criteria.
**Verified live** means checked against the real services (GitHub, Supabase, Upstash, Groq)
with the development repository `Shankar-soni-2006/GuessColor`. **Tested** means covered by
the automated suites (`npm test`: 211 backend + 36 frontend tests, including SQL against a
real Postgres via PGlite). The live smoke test (`npm run test:smoke`) passes 16/16. See
`test-report.md`. Last updated 2026-10-04.

| # | Criterion | Status | How |
|---|---|---|---|
| 1 | User can connect GitHub | ✅ Verified live | GitHub App OAuth with `state` check; session row created |
| 2 | User can select a repository | ✅ Verified live | Discovery found the installed repository; repository list with search and filters |
| 3 | Repository data can be synchronized | ✅ Verified live | `POST /sync` → *Synced*; incremental after the first sync |
| 4 | Data is stored in Supabase | ✅ Verified live | Migrations 001–007 applied; rows checked after sync |
| 5 | Pull requests are available | ✅ Verified live | 2 PRs with GitHub timestamps, sizes and cycle time |
| 6 | Reviews are available | ⚠️ Tested | Sync, storage and first-review rules are tested. GuessColor has no reviews; GitHub doesn't allow self-approval, so a live check needs a second account |
| 7 | Commits are available | ✅ Verified live | 4 commits with line stats; merge commits flagged |
| 8 | Contributors are available | ✅ Verified live | Identity and activity for the June period |
| 9 | Backend calculates engineering metrics | ✅ Verified live + tested | SQL functions pinned by a hand-computed fixture; live values match (e.g. cycle time 11.5 s) |
| 10 | Dashboard displays real metrics | ✅ Verified live | Overview metric row and data-quality notes from the API |
| 11 | Pull request table displays real data | ✅ Verified live | Table, sorting, filters and detail drawer |
| 12 | Contributor page displays real data | ✅ Verified live | Real activity; recent windows are correctly empty for GuessColor |
| 13 | Analytics page displays real trends | ⚠️ Partly | Daily series from the API are verified (31/91 rows). Chart drawing was checked with synthetic data in the browser only, because GuessColor has no recent activity |
| 14 | GitHub webhook updates repository data | ✅ Verified live (signed delivery) | Smoke test: a signed `pull_request` delivery is processed, the PR is re-fetched from GitHub, and the cache is invalidated; duplicates and forged signatures are rejected. Real GitHub deliveries pass signature checks. A GitHub-originated PR event is still to be seen |
| 15 | Redis caches analytics | ✅ Verified live | `HIT → sync → MISS → HIT`; falls back to the database when Redis is down (tested) |
| 16 | AI explains supplied metrics | ✅ Verified live | Groq answers for every mode; Fact / Evidence / Explanation / Investigation |
| 17 | AI does not invent data | ✅ Verified live + tested | Strict schema, Zod, numeric grounding; 0 insights rejected across live runs; invented numbers rejected in tests |
| 18 | Frontend handles loading, empty and error states | ✅ Verified in browser | Every page has all three; API-unreachable and AI-unavailable messages checked |
| 19 | Frontend never directly accesses GitHub, Supabase, Gemini/AI or Redis | ✅ Verified | Production bundle scan: no external API hosts; only relative `/api` calls |
| 20 | Backend handles external-service failures | ✅ Tested | GitHub errors and rate limits, DB failures during sync and webhooks, Redis down, AI down (analytics still return 200) |
| 21 | Secrets are never exposed | ✅ Verified | Bundle scan found no secret values; `.env` git-ignored and never committed; GitHub tokens AES-GCM encrypted; sessions stored as hashes |
| 22 | Deployable using environment variables | ⚠️ Prepared | Two Vercel projects: `frontend/vercel.json` (proxies `/api`) and `backend/vercel.json` + `backend/api/index.js`; `docs/deployment.md`; both Vercel builds and the bundled function verified locally; not yet deployed |
| 23 | UI looks like a professional engineering analytics platform | ✅ Self-assessed | Compact panels, tables, restrained palette, readable charts (judge for yourself) |
| 24 | UI does not look AI-generated | ✅ Self-assessed | No gradients, glow or sparkle icons; AI is one page, run on demand |

## Remaining to close the ⚠️ items

- **#6:** a review on any GuessColor PR from a second GitHub account, then Sync.
- **#13:** any recent activity (PRs, merges) in a synced repository.
- **#14 (optional):** with `npm run webhooks:relay` running, open a real PR and check
  *Settings → Webhook deliveries* for *Processed*.
- **#22:** deploy following `docs/deployment.md`.

## Deviations from the specification (agreed)

- **AI provider:** Groq (primary) and Cerebras (fallback) through an OpenAI-compatible
  client instead of Gemini, for higher free daily limits.
- **Schema:** extends the specification document with `sessions`, `user_installations`
  and `user_repositories` (security), NULL for unknown commit stats, and generated PR
  metric columns. See `docs/database/schema.md`.
- **Review delay** is the *mean* first-review wait (first review time is the median);
  the specification gave both the same formula.
- **Throughput** counts PRs *merged* in the period.
- **`scripts/seed.ts`** is intentionally absent: RepoPulse only shows real GitHub data.
