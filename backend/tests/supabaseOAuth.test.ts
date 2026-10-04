import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseOAuth } from '../src/services/auth/supabaseOAuth.js';
import { decryptSecret } from '../src/utils/crypto.js';

// Supabase Auth is reached over HTTP through global fetch; these tests answer its calls.
type Handler = (url: URL, init: RequestInit) => Response;

function fakeSupabase(handler: Handler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return handler(url, init ?? {});
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const session = (extra: Record<string, unknown>) => ({
  access_token: 'supabase-jwt',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'supabase-refresh',
  user: { id: 'u1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe('supabaseOAuth.start', () => {
  it('builds a Supabase GitHub authorize URL with PKCE and seals the verifier', async () => {
    const { url, flow } = await supabaseOAuth.start('http://localhost:3001/api/auth/callback');
    const u = new URL(url);
    expect(u.origin).toBe('http://127.0.0.1:54321');
    expect(u.pathname).toBe('/auth/v1/authorize');
    expect(u.searchParams.get('provider')).toBe('github');
    expect(u.searchParams.get('redirect_to')).toBe('http://localhost:3001/api/auth/callback');
    expect(u.searchParams.get('code_challenge_method')).toBe('s256');

    // The cookie value is encrypted; inside is the code verifier Supabase will ask for
    expect(flow).not.toContain('code-verifier');
    const entries = JSON.parse(decryptSecret(flow)) as [string, string][];
    expect(entries.some(([key]) => key.endsWith('-code-verifier'))).toBe(true);
  });
});

describe('supabaseOAuth.exchange', () => {
  const started = () => supabaseOAuth.start('http://localhost:3001/api/auth/callback');

  it('returns the GitHub App user token and refresh token, and revokes the Supabase session', async () => {
    const { flow } = await started();
    const calls: string[] = [];
    fakeSupabase((url, init) => {
      calls.push(`${init.method ?? 'GET'} ${url.pathname}${url.search}`);
      if (url.pathname === '/auth/v1/token') {
        expect(JSON.parse(String(init.body))).toMatchObject({ auth_code: 'the-code', code_verifier: expect.any(String) });
        return json(200, session({ provider_token: 'ghu_access', provider_refresh_token: 'ghr_refresh' }));
      }
      return new Response(null, { status: 204 }); // logout
    });

    const before = Date.now();
    const tokens = await supabaseOAuth.exchange('the-code', flow);
    expect(tokens.token).toBe('ghu_access');
    expect(tokens.refreshToken).toBe('ghr_refresh');
    // Assumed GitHub lifetimes: 8 h access token, ~6 months refresh token
    expect(Date.parse(tokens.expiresAt!) - before).toBeGreaterThanOrEqual(8 * 3600 * 1000 - 1000);
    expect(Date.parse(tokens.refreshTokenExpiresAt!)).toBeGreaterThan(Date.parse(tokens.expiresAt!));
    expect(calls[0]).toBe('POST /auth/v1/token?grant_type=pkce');
  });

  it('treats a non-expiring token (no refresh token) as having no expiry', async () => {
    const { flow } = await started();
    fakeSupabase((url) =>
      url.pathname === '/auth/v1/token' ? json(200, session({ provider_token: 'ghu_forever' })) : new Response(null, { status: 204 }),
    );
    expect(await supabaseOAuth.exchange('c', flow)).toEqual({ token: 'ghu_forever' });
  });

  it('reports an already-used code as OAUTH_CODE_INVALID (enables the retry)', async () => {
    const { flow } = await started();
    fakeSupabase(() => json(404, { code: 404, error_code: 'flow_state_not_found', msg: 'invalid flow state, no valid flow state found' }));
    await expect(supabaseOAuth.exchange('used', flow)).rejects.toMatchObject({ code: 'OAUTH_CODE_INVALID' });
  });

  it('fails clearly when Supabase returns no GitHub token', async () => {
    const { flow } = await started();
    fakeSupabase((url) => (url.pathname === '/auth/v1/token' ? json(200, session({})) : new Response(null, { status: 204 })));
    await expect(supabaseOAuth.exchange('c', flow)).rejects.toMatchObject({ code: 'SUPABASE_AUTH_ERROR' });
  });

  it('rejects a tampered PKCE cookie without calling Supabase', async () => {
    const fetchSpy = fakeSupabase(() => json(500, {}));
    await expect(supabaseOAuth.exchange('c', 'not-a-sealed-value')).rejects.toMatchObject({ code: 'OAUTH_CODE_INVALID' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
