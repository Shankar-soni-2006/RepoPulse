# Deployment

| Part | Platform | Config |
|---|---|---|
| Frontend and API | Vercel, one project | `vercel.json`, `api/index.js` |
| Database | Supabase | `supabase/migrations/001`–`007` |
| Cache (optional) | Upstash Redis | env vars |
| AI (optional) | Groq + Cerebras (OpenAI-compatible) | env vars |

Everything is configured through environment variables. No secret is committed, and the
frontend bundle never contains one: it only knows relative `/api` paths.

## Topology: one origin

```
browser ──▶ https://<app>.vercel.app/         static frontend (frontend/dist)
        └─▶ https://<app>.vercel.app/api/*    api/index.js → Express app (backend/dist)
GitHub webhooks ──▶ https://<app>.vercel.app/api/webhooks/github
```

The build compiles the backend (`tsc` → `backend/dist`) and the frontend (Vite →
`frontend/dist`). `vercel.json` rewrites every `/api/*` request to the single function
`api/index.js`, which hands it to the Express app with its original path. Frontend and API
share one origin, so the session cookie is first-party (`SameSite=Lax`) and OAuth callbacks
need no cross-site setup.

### How the backend fits serverless

| Concern | Handling |
|---|---|
| Work after the response (sync, webhook processing) | `waitUntil` from `@vercel/functions` keeps the function alive until it finishes (`backend/src/utils/background.ts`) |
| Time limit | `maxDuration: 300` s. Commit-stat fetching stops after 180 s; the next sync continues. An interrupted sync is reclaimable after 10 minutes |
| Raw webhook body | Vercel's request helpers must be off (`NODEJS_HELPERS=0`); the function refuses requests with a clear log line if they are on |
| AI per-user limit | Counted in Redis, so it holds across function instances |
| Webhook relay (smee) | Development only; GitHub calls the deployed URL directly |

## 1. Supabase

1. Create a project.
2. In the **SQL Editor**, run `supabase/migrations/001` → `007` in order. They can run
   as one transaction: wrap them in `begin; … commit;`.
3. Copy the **Project URL** and the **service_role / secret** key for the backend.
   Never use these in the frontend.

## 2. Vercel project

1. **Add New → Project**, import this repository. Keep **Root Directory** at the
   repository root (`./`). The build settings come from `vercel.json`.
2. Under **Environment Variables**, add the following for *Production*:

| Variable | Value |
|---|---|
| `NODEJS_HELPERS` | `0` (required, see above) |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://<app>.vercel.app` (the production domain) |
| `BACKEND_URL` | **the same** `https://<app>.vercel.app` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`. Keep it stable: changing it signs everyone out |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` | from the GitHub App (step 3). Paste the private key with its BEGIN/END lines |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | step 1 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | optional; without them analytics read the database directly |
| `AI_API_KEY`, `AI_FALLBACK_API_KEY` | optional; without them the AI page reports "not configured" |

   Do **not** set `WEBHOOK_PROXY_URL` (development relay) or `VITE_API_BASE_URL`.
3. Deploy. The first deployment shows the production domain; if it differs from what you
   entered for `FRONTEND_URL`/`BACKEND_URL`, correct both and **redeploy** (environment
   changes apply to new deployments only).
4. Check that `https://<app>.vercel.app/api/health` returns `{"success":true,…}`.

Optionally set **Settings → Functions → Region** close to the Supabase region to cut
database latency.

## 3. GitHub App (production)

Use a separate App from development, or edit the existing one:

| Setting | Value |
|---|---|
| Homepage URL | `https://<app>.vercel.app` |
| Callback URL | `https://<app>.vercel.app/api/auth/callback` |
| Webhook URL | `https://<app>.vercel.app/api/webhooks/github` |
| Webhook secret | same as `GITHUB_WEBHOOK_SECRET` |
| Permissions / events | see `architecture/github-app-setup.md` |

Editing the development App moves its callback and webhook to production, so local sign-in
and the smee relay stop working until they are changed back. A separate production App
avoids that.

## 4. Verify

- [ ] `/api/health` returns `status: ok`, and `cache: ok` if Redis is configured.
- [ ] **Continue with GitHub** signs in and lands on Repositories.
- [ ] **Sync** on a repository finishes with status *Synced*.
- [ ] Overview, Pull Requests, Contributors and Analytics show that repository's data.
- [ ] A PR opened on GitHub appears without a sync, and *Settings → Webhook deliveries*
      shows it *Processed*.
- [ ] *AI Insights → Analyze* returns an answer, or a clear "not configured" message.

Function logs are under **Deployments → (deployment) → Logs**.

## Checking the build locally

```bash
npx vercel build
```

needs a linked project (`npx vercel link`) and `NODEJS_HELPERS=0` in the environment;
the output in `.vercel/output` (git-ignored) shows the function bundle and routes.

## Operations

| Task | Command (run with production `backend/.env`) |
|---|---|
| Sync one repository | `npm run sync:repo -- <repositoryId>` |
| Recompute daily metrics (after a metric change) | `npm run metrics:recalculate -- <repositoryId>` |
| Apply a new migration | Run the new `supabase/migrations/NNN_*.sql` in the SQL Editor, then recompute metrics |
