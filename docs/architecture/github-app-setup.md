# GitHub App setup

RepoPulse reads GitHub through a **GitHub App**. Users sign in with the App's OAuth flow,
and data is read with installation tokens minted on demand.

## 1. Create the App

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**
(for an organization: Organization settings → Developer settings → GitHub Apps).

| Field | Value |
|---|---|
| GitHub App name | e.g. `RepoPulse (dev)`; the slug becomes the install URL |
| Homepage URL | your `FRONTEND_URL` |
| Callback URL | `${BACKEND_URL}/api/auth/callback`, e.g. `http://localhost:3001/api/auth/callback` |
| Expire user authorization tokens | **On** (RepoPulse refreshes them automatically) |
| Request user authorization (OAuth) during installation | Off |
| Setup URL (optional) | `${FRONTEND_URL}/repositories`, with "Redirect on update" checked |
| Webhook → Active | On once the webhook endpoint exists (Phase 7) |
| Webhook URL | `${BACKEND_URL}/api/webhooks/github` (must be publicly reachable; use a tunnel such as smee.io for local dev) |
| Webhook secret | a long random string → `GITHUB_WEBHOOK_SECRET` |

### Permissions (all **read-only**)

| Repository permission | Access | Used for |
|---|---|---|
| Metadata | Read | Repository list and details (mandatory) |
| Contents | Read | Commits and commit stats |
| Pull requests | Read | Pull requests and reviews |

No account or organization permissions are needed. RepoPulse never writes to GitHub.

### Subscribe to events

`Pull request`, `Pull request review`, `Push`.

## 2. Collect credentials into `backend/.env`

| Variable | Where |
|---|---|
| `GITHUB_APP_ID` | App settings page, "App ID" |
| `GITHUB_CLIENT_ID` | App settings page, "Client ID" |
| `GITHUB_CLIENT_SECRET` | "Generate a new client secret" |
| `GITHUB_APP_PRIVATE_KEY` | "Generate a private key" (.pem). Paste the PEM with newlines written as `\n` on one line |
| `GITHUB_WEBHOOK_SECRET` | the webhook secret you chose |

Keep these in `backend/.env` only. Never commit them or put them in `frontend/.env`.

## 3. Install the App

From the App page → **Install App**, choose the account and the repositories RepoPulse may read.
After signing in, RepoPulse shows an "Install GitHub App" link if no installation is visible,
and **Refresh from GitHub** re-reads installations after you change them.
