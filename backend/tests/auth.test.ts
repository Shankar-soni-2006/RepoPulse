import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { githubApp } from '../src/config/github';
import { sessionRepository } from '../src/repositories/sessionRepository';
import { accessRepository } from '../src/repositories/accessRepository';
import { repositoryRepository } from '../src/repositories/repositoryRepository';
import { pullRequestRepository } from '../src/repositories/pullRequestRepository';
import { sessionService } from '../src/services/auth/sessionService';
import { decryptSecret, encryptSecret, hashToken } from '../src/utils/crypto';
import {
  authHeaders,
  PR_ID,
  REPO_ID,
  TEST_SESSION_TOKEN,
  testSession,
  testUser,
} from './helpers';
import type { PullRequest, Repository } from '../src/types';

vi.mock('../src/repositories/sessionRepository');
vi.mock('../src/repositories/accessRepository');
vi.mock('../src/repositories/repositoryRepository');
vi.mock('../src/repositories/pullRequestRepository');

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
      .send({ repositoryId: REPO_ID, period: { from: '2026-09-01', to: '2026-09-30' } });
    expect(res.status).toBe(404);
  });
});

describe('OAuth flow', () => {
  it('redirects to GitHub with a state that matches the state cookie', async () => {
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin).toBe('https://github.com');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3001/api/auth/callback');

    const stateCookie = ([] as string[])
      .concat(res.headers['set-cookie'])
      .find((c) => c.startsWith('rp_oauth_state='));
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('SameSite=Lax');
    expect(stateCookie?.split(';')[0].split('=')[1]).toBe(location.searchParams.get('state'));
  });

  it('rejects a callback whose state does not match', async () => {
    const res = await request(app)
      .get('/api/auth/callback?code=abc&state=forged')
      .set('Cookie', 'rp_oauth_state=expected');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=state_mismatch');
  });

  it('rejects a callback with no state cookie', async () => {
    const res = await request(app).get('/api/auth/callback?code=abc&state=x');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=state_mismatch');
  });

  it('reports a cancelled authorization', async () => {
    const res = await request(app)
      .get('/api/auth/callback?error=access_denied&state=s')
      .set('Cookie', 'rp_oauth_state=s');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=access_denied');
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
