import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { githubApp } from '../src/config/github.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { pullRequestRepository } from '../src/repositories/pullRequestRepository.js';
import { sessionService } from '../src/services/auth/sessionService.js';
import { authService } from '../src/services/auth/authService.js';
import { supabaseOAuth } from '../src/services/auth/supabaseOAuth.js';
import { AppError } from '../src/utils/errors.js';
import { decryptSecret, encryptSecret, hashToken } from '../src/utils/crypto.js';
import {
  authHeaders,
  PR_ID,
  REPO_ID,
  TEST_SESSION_TOKEN,
  testSession,
  testUser,
} from './helpers.js';
import type { PullRequest, Repository } from '../src/types/index.js';

vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');
vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/pullRequestRepository.js');

function signedIn() {
  vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({
    session: testSession(),
    user: testUser,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue(null);
  vi.mocked(sessionRepository.touch).mockResolvedValue();
});

describe('token crypto', () => {
  it('round-trips and never stores plaintext', () => {
    const enc = encryptSecret('ghu_secret');
    expect(enc).not.toContain('ghu_secret');
    expect(decryptSecret(enc)).toBe('ghu_secret');
  });

  it('uses a fresh IV per encryption', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects tampered ciphertext', () => {
    const [v, iv, tag, ct] = encryptSecret('ghu_secret').split('.');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });
});

describe('authentication', () => {
  it('looks sessions up by token hash, not the raw token', async () => {
    await request(app).get('/api/repositories').set(authHeaders);
    expect(sessionRepository.findValidByTokenHash).toHaveBeenCalledWith(hashToken(TEST_SESSION_TOKEN));
  });

  it.each([
    ['GET', '/api/repositories'],
    ['GET', `/api/repositories/${REPO_ID}`],
    ['GET', `/api/repositories/${REPO_ID}/pull-requests`],
    ['GET', `/api/repositories/${REPO_ID}/contributors`],
    ['GET', `/api/repositories/${REPO_ID}/analytics`],
    ['GET', `/api/pull-requests/${PR_ID}`],
    ['GET', '/api/auth/me'],
    ['POST', '/api/ai/insights'],
    ['POST', '/api/repositories/discover'],
  ] as const)('%s %s requires a session', async (method, path) => {
    const req = method === 'GET' ? request(app).get(path) : request(app).post(path);
    const res = await req.set('X-RepoPulse-Client', 'web');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('treats an unknown or expired session cookie as signed out', async () => {
    const res = await request(app).get('/api/repositories').set(authHeaders);
    expect(res.status).toBe(401);
  });
});

describe('CSRF guard', () => {
  it('rejects state-changing requests without the client header', async () => {
    signedIn();
    const res = await request(app)
      .post(`/api/repositories/${REPO_ID}/sync`)
      .set('Cookie', authHeaders.Cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('allows safe methods without it', async () => {
    signedIn();
    vi.mocked(repositoryRepository.findAllForUser).mockResolvedValue([]);
    const res = await request(app).get('/api/repositories').set('Cookie', authHeaders.Cookie);
    expect(res.status).toBe(200);
  });
});

describe('repository authorization', () => {
  beforeEach(() => signedIn());

  it('lists only the signed-in user’s repositories', async () => {
    vi.mocked(repositoryRepository.findAllForUser).mockResolvedValue([]);
    await request(app).get('/api/repositories').set(authHeaders);
    expect(repositoryRepository.findAllForUser).toHaveBeenCalledWith(testUser.id);
  });

  it.each([
    ['GET', `/api/repositories/${REPO_ID}`],
    ['POST', `/api/repositories/${REPO_ID}/sync`],
    ['GET', `/api/repositories/${REPO_ID}/pull-requests`],
    ['GET', `/api/repositories/${REPO_ID}/contributors`],
    ['GET', `/api/repositories/${REPO_ID}/analytics`],
  ] as const)('%s %s returns 404 without access', async (method, path) => {
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(false);
    const req = method === 'GET' ? request(app).get(path) : request(app).post(path);
    const res = await req.set(authHeaders);
    expect(res.status).toBe(404);
    expect(accessRepository.hasRepositoryAccess).toHaveBeenCalledWith(testUser.id, REPO_ID);
  });

  it('returns the repository when the user has access', async () => {
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
    vi.mocked(repositoryRepository.findById).mockResolvedValue({ id: REPO_ID } as Repository);
    const res = await request(app).get(`/api/repositories/${REPO_ID}`).set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(REPO_ID);
  });

  it('hides pull requests in repositories the user cannot access', async () => {
    vi.mocked(pullRequestRepository.findById).mockResolvedValue({
      id: PR_ID,
      repositoryId: REPO_ID,
    } as PullRequest);
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(false);
    const res = await request(app).get(`/api/pull-requests/${PR_ID}`).set(authHeaders);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Pull request not found');
  });

  it('rejects AI requests for repositories the user cannot access', async () => {
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(false);
    const res = await request(app)
      .post('/api/ai/insights')
      .set(authHeaders)
      .send({ repositoryId: REPO_ID, mode: 'summary' });
    expect(res.status).toBe(404);
  });
});

describe('OAuth flow (GitHub via Supabase Auth)', () => {
  const callback = (query: string, cookie = 'rp_oauth_flow=sealed') =>
    request(app).get(`/api/auth/callback?${query}`).set('Cookie', cookie);

  it('starts sign-in at Supabase and keeps the PKCE state in an httpOnly cookie', async () => {
    vi.spyOn(supabaseOAuth, 'start').mockResolvedValue({ url: 'https://project.supabase.co/auth/v1/authorize?provider=github', flow: 'sealed' });
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://project.supabase.co/auth/v1/authorize?provider=github');
    expect(supabaseOAuth.start).toHaveBeenCalledWith('http://localhost:3001/api/auth/callback');
    const flowCookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('rp_oauth_flow='));
    expect(flowCookie).toContain('HttpOnly');
    expect(flowCookie).toContain('SameSite=Lax');
  });

  it('shows an error instead of crashing when Supabase is unreachable', async () => {
    vi.spyOn(supabaseOAuth, 'start').mockRejectedValue(new Error('network'));
    const res = await request(app).get('/api/auth/github');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=sign_in_failed');
  });

  it('rejects a callback without the PKCE cookie (started elsewhere or forged)', async () => {
    const res = await request(app).get('/api/auth/callback?code=abc');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=state_mismatch');
  });

  it('reports a cancelled authorization', async () => {
    const res = await callback('error=access_denied&error_description=denied');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=access_denied');
  });

  it('exchanges the code with the sealed state and opens a RepoPulse session', async () => {
    vi.spyOn(authService, 'completeLogin').mockResolvedValue('new-session-token');
    const res = await callback('code=abc');
    expect(authService.completeLogin).toHaveBeenCalledWith('abc', 'sealed');
    expect(res.headers.location).toBe('http://localhost:5173/repositories');
    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('rp_session=new-session-token');
    expect(cookies).toContain('rp_oauth_flow=; Path=/');
  });

  describe('when the code was already used (duplicate callback request)', () => {
    const usedCode = () =>
      vi
        .spyOn(supabaseOAuth, 'exchange')
        .mockRejectedValue(new AppError('OAUTH_CODE_INVALID', 'The sign-in code was already used or has expired', 400));

    it('restarts sign-in once instead of failing', async () => {
      usedCode();
      const res = await callback('code=used');
      expect(res.headers.location).toBe('http://localhost:3001/api/auth/github');
      expect(String(res.headers['set-cookie'])).toContain('rp_oauth_retry=1');
    });

    it('does not loop: a second failure shows a clear error', async () => {
      usedCode();
      const res = await callback('code=used', 'rp_oauth_flow=sealed; rp_oauth_retry=1');
      expect(res.headers.location).toBe('http://localhost:5173/login?error=oauth_code_invalid');
    });

    it('goes to the app when the first request already signed the user in', async () => {
      usedCode();
      signedIn();
      const res = await callback('code=used', `rp_oauth_flow=sealed; rp_session=${TEST_SESSION_TOKEN}`);
      expect(res.headers.location).toBe('http://localhost:5173/repositories');
    });
  });

  it('logs out by deleting the session and clearing the cookie', async () => {
    signedIn();
    vi.mocked(sessionRepository.deleteById).mockResolvedValue();
    const res = await request(app).post('/api/auth/logout').set(authHeaders);
    expect(res.status).toBe(200);
    expect(sessionRepository.deleteById).toHaveBeenCalledWith(testSession().id);
    expect(String(res.headers['set-cookie'])).toContain('rp_session=; Path=/; HttpOnly; Max-Age=0');
  });
});

describe('GitHub user token refresh', () => {
  const soon = () => new Date(Date.now() + 60_000).toISOString();
  const later = () => new Date(Date.now() + 3_600_000 * 24 * 30).toISOString();

  it('uses the stored token while it is still valid', async () => {
    const session = testSession({
      encryptedAccessToken: encryptSecret('ghu_current'),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await sessionService.getAccessToken(session)).toBe('ghu_current');
  });

  it('refreshes once for concurrent callers when the token is about to expire', async () => {
    const refresh = vi.spyOn(githubApp.oauth, 'refreshToken').mockResolvedValue({
      authentication: {
        token: 'ghu_new',
        expiresAt: later(),
        refreshToken: 'ghr_new',
        refreshTokenExpiresAt: later(),
      },
    } as Awaited<ReturnType<typeof githubApp.oauth.refreshToken>>);
    vi.mocked(sessionRepository.updateTokens).mockResolvedValue();

    const session = testSession({
      encryptedAccessToken: encryptSecret('ghu_old'),
      accessTokenExpiresAt: soon(),
      encryptedRefreshToken: encryptSecret('ghr_old'),
      refreshTokenExpiresAt: later(),
    });
    const tokens = await Promise.all([
      sessionService.getAccessToken(session),
      sessionService.getAccessToken(session),
    ]);

    expect(tokens).toEqual(['ghu_new', 'ghu_new']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ refreshToken: 'ghr_old' });
    const stored = vi.mocked(sessionRepository.updateTokens).mock.calls[0][1];
    expect(decryptSecret(stored.encrypted_access_token)).toBe('ghu_new');
    refresh.mockRestore();
  });

  it('requires re-authentication when no refresh token is available', async () => {
    const session = testSession({
      encryptedAccessToken: encryptSecret('ghu_old'),
      accessTokenExpiresAt: soon(),
    });
    await expect(sessionService.getAccessToken(session)).rejects.toMatchObject({
      code: 'GITHUB_REAUTH_REQUIRED',
      statusCode: 401,
    });
  });
});
