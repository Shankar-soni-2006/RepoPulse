# Authentication and authorization

## Sign-in (GitHub App OAuth web flow)

1. `GET /api/auth/github`: the backend creates a random `state`, stores it in a short-lived
   `rp_oauth_state` cookie (HttpOnly, SameSite=Lax, 10 min) and redirects to GitHub.
2. `GET /api/auth/callback`: the backend verifies `state` against the cookie, exchanges the
   code for a user token, upserts the user, creates a session and runs **repository
   discovery**. Then it redirects to `${FRONTEND_URL}/repositories`. Failures redirect to
   `/login?error=<code>`.
3. Discovery failure does not block sign-in; the user can run it again from the
   repositories page (`POST /api/repositories/discover`).

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

## CSRF

State-changing requests must carry `X-RepoPulse-Client`. HTML forms can't set custom
headers, and cross-origin `fetch` with one needs a CORS preflight, which only
`FRONTEND_URL` passes. Webhooks are exempt; they are authenticated by signature.

## Deployment note: cookies across sites

Browsers increasingly block third-party cookies. Serve the API under the frontend's site:
for example, a Vercel rewrite `/api/* → https://<backend>/api/*` with `VITE_API_BASE_URL`
empty, `BACKEND_URL` = the frontend origin (so the OAuth callback also goes through the
rewrite), and `SESSION_COOKIE_SAMESITE=lax`. Use `none` only if that's impossible.
