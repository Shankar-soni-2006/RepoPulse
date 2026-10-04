import { createClient, isAuthApiError } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';
import type { GitHubUserTokens } from './sessionService.js';

// GitHub sign-in through Supabase Auth's GitHub provider, run entirely on the backend
// (the browser never talks to Supabase). Supabase uses PKCE: the code verifier created
// when sign-in starts must be presented when the code is exchanged. It travels between
// the two requests in an encrypted, httpOnly cookie.
//
// The provider is configured with the GitHub App's client ID/secret, so the
// provider_token Supabase returns is a GitHub App user token: the same kind the
// backend needs for installation discovery and refreshes with the App's credentials.

// GitHub App user tokens (with "expire user authorization tokens" on) last 8 h and
// their refresh tokens 6 months. Supabase doesn't pass the expiry on, so assume it.
const ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

// Supabase errors meaning "this code can't be exchanged (again)"
const CODE_INVALID_ERRORS = new Set(['flow_state_not_found', 'flow_state_expired', 'bad_code_verifier', 'bad_oauth_callback']);

type FlowStore = Map<string, string>;

function createAuthClient(store: FlowStore) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      flowType: 'pkce',
      persistSession: true, // required for the custom storage below to be used
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    },
  });
}

const sealFlow = (store: FlowStore) => encryptSecret(JSON.stringify([...store]));

function openFlow(sealed: string): FlowStore {
  try {
    return new Map(JSON.parse(decryptSecret(sealed)) as [string, string][]);
  } catch {
    throw new AppError('OAUTH_CODE_INVALID', 'The sign-in attempt could not be verified', 400);
  }
}

export const supabaseOAuth = {
  /** Supabase authorize URL for GitHub, plus the sealed PKCE state for the callback cookie. */
  async start(redirectTo: string): Promise<{ url: string; flow: string }> {
    const store: FlowStore = new Map();
    const { data, error } = await createAuthClient(store).auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      throw new AppError('SUPABASE_AUTH_ERROR', 'Could not start GitHub sign-in', 502);
    }
    return { url: data.url, flow: sealFlow(store) };
  },

  /** Exchanges the callback code for the user's GitHub tokens. */
  async exchange(code: string, sealedFlow: string): Promise<GitHubUserTokens> {
    const client = createAuthClient(openFlow(sealedFlow));
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error) {
      if (isAuthApiError(error) && error.code && CODE_INVALID_ERRORS.has(error.code)) {
        throw new AppError('OAUTH_CODE_INVALID', 'The sign-in code was already used or has expired', 400);
      }
      console.error(`[auth] Supabase code exchange failed: ${error.code ?? error.name}: ${error.message}`);
      throw new AppError('SUPABASE_AUTH_ERROR', 'GitHub sign-in through Supabase failed', 502);
    }

    const { session } = data;
    if (!session.provider_token) {
      throw new AppError('SUPABASE_AUTH_ERROR', 'Supabase did not return a GitHub token', 502);
    }

    // RepoPulse keeps its own session; the Supabase one isn't used. Revoke it (best effort).
    client.auth.admin.signOut(session.access_token).catch(() => undefined);

    const now = Date.now();
    return session.provider_refresh_token
      ? {
          token: session.provider_token,
          expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
          refreshToken: session.provider_refresh_token,
          refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
        }
      : { token: session.provider_token }; // App without expiring user tokens
  },
};
