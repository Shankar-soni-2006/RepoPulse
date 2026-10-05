import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { adminRepository } from '../src/repositories/adminRepository.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { authService } from '../src/services/auth/authService.js';
import { supabaseOAuth } from '../src/services/auth/supabaseOAuth.js';
import { AppError } from '../src/utils/errors.js';
import { authHeaders, testAdmin, testSession, testUser } from './helpers.js';
import type { User } from '../src/types/index.js';

vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/adminRepository.js');
vi.mock('../src/repositories/userRepository.js');

const OTHER = '00000000-0000-4000-8000-0000000000cc';

function signedInAs(user: User) {
  vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession({ userId: user.id }), user });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sessionRepository.touch).mockResolvedValue();
});

describe('admin access', () => {
  it('rejects members with 403 on every admin route', async () => {
    signedInAs(testUser);
    for (const [method, path] of [
      ['get', '/api/admin/overview'],
      ['get', '/api/admin/users'],
      ['patch', `/api/admin/users/${OTHER}`],
      ['delete', `/api/admin/users/${OTHER}`],
    ] as const) {
      const res = await request(app)[method](path).set(authHeaders).send({ role: 'admin' });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_REQUIRED');
    }
    expect(adminRepository.listUsers).not.toHaveBeenCalled();
  });

  it('rejects signed-out requests with 401', async () => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue(null);
    expect((await request(app).get('/api/admin/users').set(authHeaders)).status).toBe(401);
  });

  it('requires the CSRF header for changes', async () => {
    signedInAs(testAdmin);
    const res = await request(app).delete(`/api/admin/users/${OTHER}`).set('Cookie', authHeaders.Cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });
});

describe('admin actions', () => {
  beforeEach(() => signedInAs(testAdmin));

  it('lists users and the system overview', async () => {
    vi.mocked(adminRepository.listUsers).mockResolvedValue([]);
    vi.mocked(adminRepository.overview).mockResolvedValue({
      users: 2, admins: 1, suspended: 0, newUsers7d: 1, activeSessions: 2,
      repositories: 3, syncedRepositories: 3, failedSyncs: 0, webhookFailures24h: 0,
    });
    expect((await request(app).get('/api/admin/users').set(authHeaders)).body).toEqual({ success: true, data: [] });
    expect((await request(app).get('/api/admin/overview').set(authHeaders)).body.data.users).toBe(2);
  });

  it('changes a role and suspends or reinstates a user', async () => {
    vi.mocked(adminRepository.setRole).mockResolvedValue();
    vi.mocked(adminRepository.setSuspended).mockResolvedValue();
    expect((await request(app).patch(`/api/admin/users/${OTHER}`).set(authHeaders).send({ role: 'admin' })).status).toBe(200);
    expect(adminRepository.setRole).toHaveBeenCalledWith(OTHER, 'admin');
    expect((await request(app).patch(`/api/admin/users/${OTHER}`).set(authHeaders).send({ suspended: true })).status).toBe(200);
    expect(adminRepository.setSuspended).toHaveBeenCalledWith(OTHER, true);
  });

  it('deletes a user', async () => {
    vi.mocked(adminRepository.deleteUser).mockResolvedValue();
    expect((await request(app).delete(`/api/admin/users/${OTHER}`).set(authHeaders)).body.data).toEqual({ deleted: true });
  });

  it('never lets an admin act on their own account', async () => {
    for (const req of [
      request(app).patch(`/api/admin/users/${testAdmin.id}`).set(authHeaders).send({ role: 'member' }),
      request(app).patch(`/api/admin/users/${testAdmin.id}`).set(authHeaders).send({ suspended: true }),
      request(app).delete(`/api/admin/users/${testAdmin.id}`).set(authHeaders),
    ]) {
      const res = await req;
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SELF_ACTION');
    }
    expect(adminRepository.setRole).not.toHaveBeenCalled();
    expect(adminRepository.deleteUser).not.toHaveBeenCalled();
  });

  it('reports the database rules (last admin, admins protected) as 409', async () => {
    vi.mocked(adminRepository.setRole).mockRejectedValue(new AppError('LAST_ADMIN', 'RepoPulse needs at least one active admin', 409));
    const res = await request(app).patch(`/api/admin/users/${OTHER}`).set(authHeaders).send({ role: 'member' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
  });

  it('validates the update and the user id', async () => {
    expect((await request(app).patch(`/api/admin/users/${OTHER}`).set(authHeaders).send({ role: 'owner' })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/users/${OTHER}`).set(authHeaders).send({})).status).toBe(400);
    expect((await request(app).patch('/api/admin/users/not-a-uuid').set(authHeaders).send({ role: 'admin' })).status).toBe(400);
  });
});

describe('suspended accounts', () => {
  it('are signed out on their next request', async () => {
    signedInAs({ ...testUser, suspendedAt: '2026-10-05T00:00:00Z' });
    const res = await request(app).get('/api/repositories').set(authHeaders);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('cannot sign in again', async () => {
    vi.spyOn(supabaseOAuth, 'exchange').mockResolvedValue({ token: 'ghu_x' });
    vi.mocked(userRepository.upsertFromGitHub).mockResolvedValue({ ...testUser, suspendedAt: '2026-10-05T00:00:00Z' });
    const profile = vi.fn().mockResolvedValue({ data: { id: 42, login: 'octocat', name: null, email: null, avatar_url: '' } });
    const octokit = await import('../src/services/github/octokit.js');
    vi.spyOn(octokit, 'createUserOctokit').mockReturnValue({ users: { getAuthenticated: profile } } as never);

    await expect(authService.completeLogin('code', 'flow')).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  it('the admin login form refuses members before creating a session', async () => {
    vi.spyOn(supabaseOAuth, 'exchange').mockResolvedValue({ token: 'ghu_x' });
    vi.mocked(userRepository.upsertFromGitHub).mockResolvedValue(testUser);
    const profile = vi.fn().mockResolvedValue({ data: { id: 42, login: 'octocat', name: null, email: null, avatar_url: '' } });
    const octokit = await import('../src/services/github/octokit.js');
    vi.spyOn(octokit, 'createUserOctokit').mockReturnValue({ users: { getAuthenticated: profile } } as never);

    await expect(authService.completeLogin('code', 'flow', { requireAdmin: true })).rejects.toMatchObject({ code: 'NOT_ADMIN' });
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  it('see their role in the session info', async () => {
    signedInAs(testAdmin);
    vi.spyOn(authService, 'getSessionInfo').mockImplementation(async (u) => ({
      user: { id: u.id, login: u.login, name: u.name, avatarUrl: u.avatarUrl, role: u.role },
      installations: [],
      installUrl: null,
    }));
    const res = await request(app).get('/api/auth/me').set(authHeaders);
    expect(res.body.data.user.role).toBe('admin');
  });
});
