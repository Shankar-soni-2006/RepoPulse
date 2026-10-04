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
| Callback URL | **Supabase's** callback: `https://<project-ref>.supabase.co/auth/v1/callback` (sign-in goes through Supabase Auth, see `auth.md`) |
| Expire user authorization tokens | **On** (RepoPulse refreshes them automatically) |
| Request user authorization (OAuth) during installation | Off |
| Setup URL (optional) | `${FRONTEND_URL}/repositories`, with "Redirect on update" checked |
| Webhook → Active | On |
| Webhook URL | Production: `${BACKEND_URL}/api/webhooks/github`. Local development: the smee.io URL in `WEBHOOK_PROXY_URL` (see `webhooks.md`) |
| Webhook secret | a long random string → `GITHUB_WEBHOOK_SECRET` |

### Permissions (all **read-only**)

| Repository permission | Access | Used for |
|---|---|---|
| Metadata | Read | Repository list and details (mandatory) |
| Contents | Read | Commits and commit stats |
| Pull requests | Read | Pull requests and reviews |

| Account permission | Access | Used for |
|---|---|---|
| Email addresses | Read | Required by Supabase Auth's GitHub provider, which reads the user's email at sign-in |

RepoPulse never writes to GitHub. After adding a permission, each installation owner must
accept it (GitHub shows a banner on the installation).

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

## 3. Supabase Auth (GitHub provider)

Supabase dashboard → **Authentication**:

1. **Sign In / Providers → GitHub**: enable; **Client ID** and **Client Secret** = the
   GitHub App's (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`). Supabase shows the callback URL
   to register on the App (`https://<project-ref>.supabase.co/auth/v1/callback`).
2. **URL Configuration**: *Site URL* = `FRONTEND_URL`; *Redirect URLs* = every
   `${BACKEND_URL}/api/auth/callback` you use, e.g.
   `https://repopulse-shankar.vercel.app/api/auth/callback` and
   `http://localhost:3001/api/auth/callback`. Supabase refuses other `redirect_to` values.

No extra environment variables: the backend uses `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`.

Keep these in `backend/.env` only. Never commit them or put them in `frontend/.env`.

## 3. Install the App

From the App page → **Install App**, choose the account and the repositories RepoPulse may read.
After signing in, RepoPulse shows an "Install GitHub App" link if no installation is visible,
and **Refresh from GitHub** re-reads installations after you change them.
