import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { installationRepository } from '../src/repositories/installationRepository.js';
import { teamRepository, type AccessibleRepository } from '../src/repositories/teamRepository.js';
import { authHeaders, testAdmin, testSession, testUser } from './helpers.js';
import type { PeriodMetrics, User } from '../src/types/index.js';

vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/installationRepository.js');
vi.mock('../src/repositories/teamRepository.js');

const ORG = '00000000-0000-4000-8000-00000000a001';
const OTHER_ORG = '00000000-0000-4000-8000-00000000a002';
const repo = (id: string, installationId: string, synced = true): AccessibleRepository => ({
  id,
  fullName: `acme/${id.slice(-4)}`,
  installationId,
  lastSyncedAt: synced ? '2026-10-01T00:00:00Z' : null,
  dataSince: synced ? '2026-04-01T00:00:00Z' : null,
});
const R1 = '00000000-0000-4000-8000-00000000b001';
const R2 = '00000000-0000-4000-8000-00000000b002';
const R3 = '00000000-0000-4000-8000-00000000b003'; // not synced
const ELSEWHERE = '00000000-0000-4000-8000-00000000b009'; // another account's repo

const metrics = (n: number) => ({ prThroughput: n, activeContributors: n } as unknown as PeriodMetrics);

function signedInAs(user: User) {
  vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession({ userId: user.id }), user });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sessionRepository.touch).mockResolvedValue();
  signedInAs(testUser);
  vi.mocked(installationRepository.findForUser).mockResolvedValue([
    { id: ORG, installationId: 1, accountLogin: 'acme', accountType: 'Organization' },
  ]);
  vi.mocked(teamRepository.accessibleRepositories).mockResolvedValue([repo(R1, ORG), repo(R2, ORG), repo(R3, ORG, false), repo(ELSEWHERE, OTHER_ORG)]);
  vi.mocked(teamRepository.periodMetrics).mockResolvedValue({ metrics: metrics(4), commitStatsCoverage: 1 });
  vi.mocked(teamRepository.members).mockResolvedValue([]);
  vi.mocked(teamRepository.breakdown).mockResolvedValue([]);
  vi.mocked(teamRepository.dailyTrends).mockResolvedValue([]);
});

describe('team view API', () => {
  it('lists the accounts the user can see, with accessible and synced repository counts', async () => {
    const res = await request(app).get('/api/team/accounts').set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: ORG, login: 'acme', type: 'Organization', repositoryCount: 3, syncedRepositoryCount: 2 },
    ]);
  });

  it('combines only the synced repositories of that account that the user can access', async () => {
    const res = await request(app).get(`/api/team/accounts/${ORG}?days=30`).set(authHeaders);
    expect(res.status).toBe(200);
    for (const fn of [teamRepository.periodMetrics, teamRepository.members, teamRepository.breakdown]) {
      expect(vi.mocked(fn).mock.calls[0][0]).toEqual([R1, R2]); // not R3 (unsynced), not another account's repo
    }
    expect(res.body.data.account).toMatchObject({ login: 'acme', repositoryCount: 3, syncedRepositoryCount: 2 });
    expect(res.body.data.dataQuality.limitations[0]).toBe('1 of 3 repositories has not been synchronized and is not included.');
    expect(res.body.data.period.days).toBe(30);
  });

  it('answers 404 for an account the user cannot see (no existence leak)', async () => {
    const res = await request(app).get(`/api/team/accounts/${OTHER_ORG}`).set(authHeaders);
    expect(res.status).toBe(404);
    expect(teamRepository.periodMetrics).not.toHaveBeenCalled();
  });

  it('gives admins no extra access: their GitHub access decides, as for members', async () => {
    signedInAs(testAdmin);
    expect((await request(app).get(`/api/team/accounts/${OTHER_ORG}`).set(authHeaders)).status).toBe(404);
  });

  it('requires sign-in and validates input', async () => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue(null);
    expect((await request(app).get('/api/team/accounts').set(authHeaders)).status).toBe(401);
    signedInAs(testUser);
    expect((await request(app).get('/api/team/accounts/not-a-uuid').set(authHeaders)).status).toBe(400);
    expect((await request(app).get(`/api/team/accounts/${ORG}?days=14`).set(authHeaders)).status).toBe(400);
  });

  it('says so when nothing has been synced yet', async () => {
    vi.mocked(teamRepository.accessibleRepositories).mockResolvedValue([repo(R3, ORG, false)]);
    const res = await request(app).get(`/api/team/accounts/${ORG}`).set(authHeaders);
    expect(res.body.data.dataQuality.limitations).toEqual([
      'None of these repositories has been synchronized yet, so no activity is available.',
    ]);
  });
});
