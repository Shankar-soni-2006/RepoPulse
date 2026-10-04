# Deployment

| Part | Platform | Config |
|---|---|---|
| Frontend | Vercel | `frontend/vercel.json` |
| Backend API | Render (any Node 20+ host works) | `render.yaml` |
| Database | Supabase | `supabase/migrations/001`–`007` |
| Cache (optional) | Upstash Redis | env vars |
| AI (optional) | Groq + Cerebras (OpenAI-compatible) | env vars |

Everything is configured through environment variables. No secret is committed, and the
frontend bundle never contains one: it only knows relative `/api` paths.

## Topology: one site for the browser

```
browser ──▶ https://repopulse.vercel.app/            (static frontend)
        └─▶ https://repopulse.vercel.app/api/*  ──rewrite──▶  https://repopulse-api.onrender.com/api/*
GitHub webhooks ─────────────────────────────────────────────▶  https://repopulse-api.onrender.com/api/webhooks/github
```

Vercel forwards `/api/*` to the backend, so the session cookie is first-party
(`SameSite=Lax`). Browsers increasingly block third-party cookies, so don't call the API
cross-site from the browser.

## 1. Supabase

1. Create a project.
2. In the **SQL Editor**, run `supabase/migrations/001` → `007` in order. They can run
   as one transaction: wrap them in `begin; … commit;`.
3. Copy the **Project URL** and the **service_role / secret** key for the backend.
   Never use these in the frontend.

## 2. Backend on Render

1. **New → Blueprint**, select this repository. Render reads `render.yaml`.
2. Fill in the variables it asks for:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | `https://<your-app>.vercel.app` |
| `BACKEND_URL` | **the same** `https://<your-app>.vercel.app` (OAuth callbacks go through the rewrite) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`. Keep it stable: changing it signs everyone out |
| `GITHUB_*` | from the GitHub App (step 4) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | step 1 |
| `UPSTASH_REDIS_REST_URL`, `_TOKEN` | optional; without them, analytics read the database directly |
| `AI_API_KEY`, `AI_FALLBACK_API_KEY` | optional; without them, the AI page reports "not configured" |

3. Deploy, then check that `https://<backend>.onrender.com/api/health` returns
   `{"success":true,…}`.

Free Render instances sleep when idle. The first request after a pause takes a few
seconds, and a sync running when the instance sleeps is reclaimed after 30 minutes
(see `sync.md`).

## 3. Frontend on Vercel

1. In `frontend/vercel.json`, replace `REPLACE-WITH-YOUR-BACKEND-HOST` with the Render
   host, for example `repopulse-api.onrender.com`.
2. **New Project** → import the repository, set **Root Directory** to `frontend`.
3. **Leave `VITE_API_BASE_URL` unset.** The app calls relative `/api` paths.
4. Deploy, then check that `https://<your-app>.vercel.app/api/health` returns the backend
   health JSON through the rewrite.

## 4. GitHub App (production)

Use a separate App from development, or edit the existing one:

| Setting | Value |
|---|---|
| Homepage URL | `https://<your-app>.vercel.app` |
| Callback URL | `https://<your-app>.vercel.app/api/auth/callback` |
| Webhook URL | `https://<backend>.onrender.com/api/webhooks/github` (direct to the backend) |
| Webhook secret | same as `GITHUB_WEBHOOK_SECRET` |
| Permissions / events | see `architecture/github-app-setup.md` |

## 5. Verify

- [ ] `/api/health` on both URLs returns `status: ok`, and `cache: ok` if Redis is configured.
- [ ] **Continue with GitHub** signs in and lands on Repositories.
- [ ] **Sync** on a repository finishes with status *Synced*.
- [ ] Overview, Pull Requests, Contributors and Analytics show that repository's data.
- [ ] A PR opened on GitHub appears without a sync, and *Settings → Webhook deliveries*
      shows it *Processed*.
- [ ] *AI Insights → Analyze* returns an answer, or a clear "not configured" message.

## Operations

| Task | Command (run with production `backend/.env`) |
|---|---|
| Sync one repository | `npm run sync:repo -- <repositoryId>` |
| Recompute daily metrics (after a metric change) | `npm run metrics:recalculate -- <repositoryId>` |
| Apply a new migration | Run the new `supabase/migrations/NNN_*.sql` in the SQL Editor, then recompute metrics |
