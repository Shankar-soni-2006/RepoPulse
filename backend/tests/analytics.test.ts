import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import {
  analyticsService,
  buildLimitations,
  compareMetrics,
  periodWindow,
} from '../src/services/analytics/analyticsService.js';
import { analyticsRepository } from '../src/repositories/analyticsRepository.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import type { PeriodMetrics, Repository } from '../src/types/index.js';
import { authHeaders, REPO_ID, testSession, testUser } from './helpers.js';

vi.mock('../src/repositories/analyticsRepository.js');
vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');

const NOW = new Date('2026-10-03T12:00:00.000Z');

function metrics(overrides: Partial<PeriodMetrics> = {}): PeriodMetrics {
  return {
    prThroughput: 10,
    prsOpened: 12,
    cycleTime: 20,
    firstReviewTime: 4,
    reviewDelay: 6,
    prSize: 200,
    codeChurn: 5000,
    additions: 4000,
    deletions: 1000,
    commitCount: 40,
    reviewCount: 25,
    activeContributors: 5,
    openPrsWithoutReview: 2,
    oldestUnreviewedWait: 30,
    commitsMissingStats: 0,
    ...overrides,
  };
}

const syncedRepo = { lastSyncedAt: '2026-10-03T11:00:00.000Z', dataSince: '2026-04-06T12:00:00.000Z' };

describe('periodWindow', () => {
  it('ends now and compares with the equally long period before', () => {
    expect(periodWindow(30, NOW)).toMatchObject({
      period: { from: '2026-09-03T12:00:00.000Z', to: '2026-10-03T12:00:00.000Z', days: 30 },
      previousPeriod: { from: '2026-08-04T12:00:00.000Z', to: '2026-09-03T12:00:00.000Z' },
    });
  });
});

describe('compareMetrics', () => {
  it('reports fractional change against the previous period', () => {
    const changes = compareMetrics(metrics({ cycleTime: 25.4 }), metrics({ cycleTime: 20 }));
    expect(changes.cycleTime).toBeCloseTo(0.27);
    expect(changes.prThroughput).toBe(0);
  });

  it('returns null instead of a misleading percentage', () => {
    const changes = compareMetrics(
      metrics({ cycleTime: 12, prThroughput: 4, prSize: null }),
      metrics({ cycleTime: null, prThroughput: 0, prSize: 100 }),
    );
    expect(changes.cycleTime).toBeNull(); // no previous value
    expect(changes.prThroughput).toBeNull(); // previous was 0
    expect(changes.prSize).toBeNull(); // no current value
  });
});

describe('buildLimitations', () => {
  const period = { from: '2026-09-03T12:00:00.000Z' };
  const previous = { from: '2026-08-04T12:00:00.000Z' };

  it('says so when the repository was never synced', () => {
    expect(buildLimitations({ lastSyncedAt: null, dataSince: null }, period, previous, metrics())).toEqual([
      'This repository has not been synchronized yet, so no activity is available.',
    ]);
  });

  it('flags periods older than the imported data', () => {
    const lim = buildLimitations({ ...syncedRepo, dataSince: '2026-09-20T00:00:00.000Z' }, period, previous, metrics());
    expect(lim[0]).toBe('Activity before 2026-09-20 has not been imported, so this period is only partly covered.');
  });

  it('flags an incomplete comparison period', () => {
    const lim = buildLimitations({ ...syncedRepo, dataSince: '2026-08-20T00:00:00.000Z' }, period, previous, metrics());
    expect(lim[0]).toMatch(/comparison with the previous period is incomplete/);
  });

  it('explains missing merges, reviews and commit stats', () => {
    const lim = buildLimitations(
      syncedRepo,
      period,
      previous,
      metrics({ prThroughput: 0, cycleTime: null, prSize: null, firstReviewTime: null, commitsMissingStats: 1 }),
    );
    expect(lim).toEqual([
      'No pull requests were merged in this period, so cycle time and PR size are unavailable.',
      'No pull request received its first review in this period, so review timing is unavailable.',
      'Line counts are not yet known for 1 commit; code churn is understated until the next sync fetches them.',
      'Commits are counted on the default branch only. Days are in UTC.',
    ]);
  });
});

describe('analyticsService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(repositoryRepository.findById).mockResolvedValue({ id: REPO_ID, ...syncedRepo } as Repository);
    vi.mocked(analyticsRepository.periodMetrics)
      .mockResolvedValueOnce({ metrics: metrics({ cycleTime: 25 }), commitStatsCoverage: 0.9 })
      .mockResolvedValueOnce({ metrics: metrics({ cycleTime: 20 }), commitStatsCoverage: 1 });
    vi.mocked(analyticsRepository.dailyTrends).mockResolvedValue([]);
  });

  it('queries the current and previous windows and compares them', async () => {
    const result = await analyticsService.getMetrics(REPO_ID, 30, NOW);
    const calls = vi.mocked(analyticsRepository.periodMetrics).mock.calls;
    expect(calls[0].slice(1).map((d) => (d as Date).toISOString())).toEqual([
      '2026-09-03T12:00:00.000Z',
      '2026-10-03T12:00:00.000Z',
    ]);
    expect(calls[1].slice(1).map((d) => (d as Date).toISOString())).toEqual([
      '2026-08-04T12:00:00.000Z',
      '2026-09-03T12:00:00.000Z',
    ]);
    expect(result.changes.cycleTime).toBeCloseTo(0.25);
    expect(result.dataQuality).toMatchObject({ commitStatsCoverage: 0.9, dataSince: syncedRepo.dataSince });
  });

  it('reads daily trends for the UTC days in the period', async () => {
    await analyticsService.getAnalytics(REPO_ID, 7, NOW);
    expect(analyticsRepository.dailyTrends).toHaveBeenCalledWith(REPO_ID, '2026-09-26', '2026-10-03');
  });

  it('returns 404 for an unknown repository', async () => {
    vi.mocked(repositoryRepository.findById).mockResolvedValue(null);
    await expect(analyticsService.getMetrics(REPO_ID, 7, NOW)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('analytics endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession(), user: testUser });
    vi.mocked(sessionRepository.touch).mockResolvedValue();
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
    vi.mocked(repositoryRepository.findById).mockResolvedValue({ id: REPO_ID, ...syncedRepo } as Repository);
    vi.mocked(analyticsRepository.periodMetrics).mockResolvedValue({ metrics: metrics(), commitStatsCoverage: 1 });
    vi.mocked(analyticsRepository.dailyTrends).mockResolvedValue([]);
    vi.mocked(analyticsRepository.contributorActivity).mockResolvedValue([]);
  });

  it.each(['analytics', 'metrics', 'contributors'])('GET /%s defaults to 30 days', async (path) => {
    const res = await request(app).get(`/api/repositories/${REPO_ID}/${path}`).set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.data.period.days).toBe(30);
  });

  it('includes trends only in /analytics', async () => {
    const analytics = await request(app).get(`/api/repositories/${REPO_ID}/analytics?days=7`).set(authHeaders);
    const summary = await request(app).get(`/api/repositories/${REPO_ID}/metrics?days=7`).set(authHeaders);
    expect(analytics.body.data).toHaveProperty('trends');
    expect(summary.body.data).not.toHaveProperty('trends');
  });

  it.each(['analytics', 'metrics', 'contributors'])('GET /%s rejects unsupported periods', async (path) => {
    const res = await request(app).get(`/api/repositories/${REPO_ID}/${path}?days=14`).set(authHeaders);
    expect(res.status).toBe(400);
  });

  it.each(['analytics', 'metrics', 'contributors'])('GET /%s requires repository access', async (path) => {
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(false);
    const res = await request(app).get(`/api/repositories/${REPO_ID}/${path}`).set(authHeaders);
    expect(res.status).toBe(404);
    expect(analyticsRepository.periodMetrics).not.toHaveBeenCalled();
  });
});
