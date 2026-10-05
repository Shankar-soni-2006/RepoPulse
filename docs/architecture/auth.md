# Authentication and authorization

## Sign-in (GitHub through Supabase Auth, server-side PKCE)

GitHub sign-in goes through **Supabase Auth's GitHub provider**, configured with the
**GitHub App's** client ID and secret. The whole exchange runs on the backend
(`services/auth/supabaseOAuth.ts`); the browser never talks to Supabase.

```
browser → GET /api/auth/github → Supabase /auth/v1/authorize → github.com (authorize)
        → Supabase /auth/v1/callback → GET /api/auth/callback?code=… → /repositories
```

1. `GET /api/auth/github`: the backend asks supabase-js (PKCE flow) for the authorize URL
   with `redirect_to = ${BACKEND_URL}/api/auth/callback`. The PKCE code verifier is
   **encrypted** (`TOKEN_ENCRYPTION_KEY`) into the `rp_oauth_flow` cookie (HttpOnly,
   SameSite=Lax, 10 min). Only the browser that started sign-in can finish it, which is
   the CSRF protection.
2. `GET /api/auth/callback`: the backend exchanges `code` + verifier with Supabase
   (`exchangeCodeForSession`). From the result it uses only `provider_token` and
   `provider_refresh_token`, a **GitHub App user token**, then revokes the Supabase
   session. It reads the GitHub profile, upserts the user, creates the RepoPulse session
   and runs **repository discovery**, then redirects to `${FRONTEND_URL}/repositories`.
   Failures redirect to `/login?error=<code>`.
3. Supabase does not report GitHub token lifetimes, so the backend assumes GitHub App
   defaults: 8 h access token, ~6 months refresh token. Tokens are refreshed with the App's
   own credentials (`githubApp.oauth.refreshToken`).
4. A code that was already used (for example the callback was requested twice) restarts
   sign-in once (`rp_oauth_retry` cookie), or continues if the browser is already signed in.
5. Discovery failure does not block sign-in; the user can run it again from the
   repositories page (`POST /api/repositories/discover`).

Why not Supabase sessions: RepoPulse needs the GitHub token for installation discovery and
keeps refreshing it. Supabase hands the provider token over only once and doesn't refresh
it, so RepoPulse keeps its own session (below) and stores the tokens itself. Supabase
`auth.users` gets a row per signed-in user as a side effect.

## Sessions

- The cookie `rp_session` holds a random 256-bit token (HttpOnly; `Secure` in production;
  SameSite from `SESSION_COOKIE_SAMESITE`). Lifetime: 7 days.
- The `sessions` table stores only **SHA-256(token)**, so a database leak can't be replayed.
- The GitHub user token and refresh token are stored **AES-256-GCM encrypted**
  (`TOKEN_ENCRYPTION_KEY`).
- A user token within 5 minutes of expiry is refreshed before use. Concurrent requests share
  one refresh because GitHub refresh tokens are single-use. If refresh is impossible, the API
  returns `401 GITHUB_REAUTH_REQUIRED`.
- `POST /api/auth/logout` deletes the session row and clears the cookie.

## Authorization

- `user_repositories` is the source of truth for who can see what. Discovery rebuilds it
  from GitHub's per-user installation repository list, adding new grants and revoking
  removed ones.
- Every repository-scoped route runs `requireAuth` → param validation →
  `requireRepositoryAccess`. Users without access get **404**, not 403, so repository
  existence isn't revealed. The PR detail and AI routes check the owning repository the
  same way.

## Roles: admin and member (migration 008)

| | Member (default) | Admin |
|---|---|---|
| Repositories, analytics, PRs, contributors, AI | Repositories GitHub gives them access to | **Same**: GitHub access still applies |
| Admin page (`/admin`, `/api/admin/*`) | 403 `ADMIN_REQUIRED` | System overview; list users; change roles; suspend/reinstate; delete accounts |

- `users.role` is `member` by default. Create the first admin with
  `npm run admin:role -- <github-login> admin` (the user must have signed in once);
  afterwards admins change roles on the Admin page.
- **Login forms:** the login page has a **Member** and an **Admin** form, both GitHub sign-in.
  The Admin form (`/api/auth/github?as=admin`, remembered in the `rp_login_as` cookie)
  refuses accounts without the admin role **before** a session is created (`NOT_ADMIN`) and
  sends admins to `/admin`. Picking a form never grants a role.
- **Suspension** (`users.suspended_at`) deletes the user's sessions and blocks sign-in
  (`ACCOUNT_SUSPENDED`). A session that slips through is refused on its next request.
- **Delete** removes the user, their sessions and access grants; repository activity shared
  with other users is kept.
- Rules enforced in SQL (`admin_set_role`, `admin_set_suspended`, `admin_delete_user`),
  so concurrent requests can't break them: there is always at least one active admin
  (`LAST_ADMIN`); admins can't be suspended or deleted until changed to member
  (`TARGET_IS_ADMIN`). The API adds: admins can't act on their own account
  (`SELF_ACTION`).
- The admin functions are callable only by the backend's service role.

## CSRF

State-changing requests must carry `X-RepoPulse-Client`. HTML forms can't set custom
headers, and cross-origin `fetch` with one needs a CORS preflight, which only
`FRONTEND_URL` passes. Webhooks are exempt; they are authenticated by signature.

## Deployment note: cookies across sites

Browsers increasingly block third-party cookies. Serve the API under the frontend's site:
for example, a Vercel rewrite `/api/* → https://<backend>/api/*` with `VITE_API_BASE_URL`
empty, `BACKEND_URL` = the frontend origin (so the OAuth callback also goes through the
rewrite), and `SESSION_COOKIE_SAMESITE=lax`. Use `none` only if that's impossible.
