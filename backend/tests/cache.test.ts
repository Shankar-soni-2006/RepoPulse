import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Redis } from '@upstash/redis';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { cacheKeys, cacheService } from '../src/services/cache/cacheService.js';
import { analyticsRepository } from '../src/repositories/analyticsRepository.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import type { PeriodMetrics, Repository } from '../src/types/index.js';
import { authHeaders, REPO_ID, testSession, testUser } from './helpers.js';

vi.mock('@upstash/redis');
vi.mock('../src/repositories/analyticsRepository.js');
vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');

// In-memory stand-in for Upstash's REST client
let store: Map<string, unknown>;
let fake: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
};

function useRedis(configured: boolean) {
  env.UPSTASH_REDIS_REST_URL = configured ? 'https://example.upstash.io' : undefined;
  env.UPSTASH_REDIS_REST_TOKEN = configured ? 'token' : undefined;
  cacheService.resetForTests();
}

beforeEach(() => {
  vi.resetAllMocks();
  store = new Map();
  fake = {
    get: vi.fn(async (k: string) => (store.has(k) ? structuredClone(store.get(k)) : null)),
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, structuredClone(v));
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => keys.filter((k) => store.delete(k)).length),
    ping: vi.fn(async () => 'PONG'),
  };
  vi.mocked(Redis).mockImplementation(function () {
    return fake as unknown as Redis;
  } as unknown as typeof Redis);
  useRedis(true);
});

afterEach(() => useRedis(false));

describe('cacheService.getOrLoad', () => {
  it('loads on a miss, caches with a TTL, and serves the next call from Redis', async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    expect(await cacheService.getOrLoad('k', load)).toEqual({ value: { n: 1 }, cache: 'MISS' });
    expect(await cacheService.getOrLoad('k', load)).toEqual({ value: { n: 1 }, cache: 'HIT' });
    expect(load).toHaveBeenCalledTimes(1);
    expect(fake.set).toHaveBeenCalledWith('k', { n: 1 }, { ex: 600 });
  });

  it('fails fast on the request path but retries invalidation', async () => {
    await cacheService.getOrLoad('k', async () => 1);
    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.upstash.io', token: 'token', retry: false, signal: expect.any(Function) }),
    );
    expect(Redis).toHaveBeenCalledTimes(2); // request-path and invalidation clients
  });

  it('bypasses the cache entirely when Redis is not configured', async () => {
    useRedis(false);
    const load = vi.fn(async () => 'fresh');
    expect(await cacheService.getOrLoad('k', load)).toEqual({ value: 'fresh', cache: 'BYPASS' });
    expect(await cacheService.getOrLoad('k', load)).toEqual({ value: 'fresh', cache: 'BYPASS' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(Redis).not.toHaveBeenCalled();
  });

  it('falls back to the database when Redis reads fail', async () => {
    fake.get.mockRejectedValue(new Error('timeout'));
    const load = vi.fn(async () => 'fresh');
    expect(await cacheService.getOrLoad('k', load)).toEqual({ value: 'fresh', cache: 'BYPASS' });
  });

  it('still returns the value when Redis writes fail', async () => {
    fake.set.mockRejectedValue(new Error('read-only'));
    expect(await cacheService.getOrLoad('k', async () => 'fresh')).toEqual({ value: 'fresh', cache: 'MISS' });
  });

  it('does not cache failures', async () => {
    await expect(cacheService.getOrLoad('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(fake.set).not.toHaveBeenCalled();
  });
});

describe('cacheService.invalidateRepository', () => {
  it('drops overview, analytics and contributor entries for every period', async () => {
    await cacheService.invalidateRepository(REPO_ID);
    const keys = fake.del.mock.calls[0];
    expect(keys).toHaveLength(9);
    expect(keys).toEqual(
      expect.arrayContaining([
        `repo:${REPO_ID}:overview:7`,
        `repo:${REPO_ID}:analytics:30`,
        `repo:${REPO_ID}:contributors:90`,
      ]),
    );
  });

  it('retries a timed-out invalidation', async () => {
    fake.del.mockRejectedValueOnce(new Error('The operation was aborted due to timeout')).mockResolvedValueOnce(9);
    await cacheService.invalidateRepository(REPO_ID);
    expect(fake.del).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts without throwing', async () => {
    fake.del.mockRejectedValue(new Error('down'));
    await expect(cacheService.invalidateRepository(REPO_ID)).resolves.toBeUndefined();
    expect(fake.del).toHaveBeenCalledTimes(3);
  });
});

describe('cacheService.status', () => {
  it('reports ok, error and disabled', async () => {
    expect(await cacheService.status()).toBe('ok');
    fake.ping.mockRejectedValue(new Error('down'));
    expect(await cacheService.status()).toBe('error');
    useRedis(false);
    expect(await cacheService.status()).toBe('disabled');
  });
});

describe('cached analytics endpoints', () => {
  const metrics = { prThroughput: 1, prsOpened: 1, cycleTime: 2, firstReviewTime: null, reviewDelay: null, prSize: 3,
    codeChurn: 4, additions: 2, deletions: 2, commitCount: 1, reviewCount: 0, activeContributors: 1,
    openPrsWithoutReview: 0, oldestUnreviewedWait: null, commitsMissingStats: 0 } satisfies PeriodMetrics;

  beforeEach(() => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession(), user: testUser });
    vi.mocked(sessionRepository.touch).mockResolvedValue();
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
    vi.mocked(repositoryRepository.findById).mockResolvedValue({ id: REPO_ID, lastSyncedAt: 'x', dataSince: 'x' } as Repository);
    vi.mocked(analyticsRepository.periodMetrics).mockResolvedValue({ metrics, commitStatsCoverage: 1 });
    vi.mocked(analyticsRepository.dailyTrends).mockResolvedValue([]);
  });

  it('serves the second request from Redis without touching the database', async () => {
    const first = await request(app).get(`/api/repositories/${REPO_ID}/analytics?days=7`).set(authHeaders);
    const second = await request(app).get(`/api/repositories/${REPO_ID}/analytics?days=7`).set(authHeaders);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
    expect(analyticsRepository.periodMetrics).toHaveBeenCalledTimes(2); // current + previous, once
    expect(store.has(cacheKeys.analytics(REPO_ID, 7))).toBe(true);
  });

  it('keeps periods and endpoints in separate entries', async () => {
    await request(app).get(`/api/repositories/${REPO_ID}/analytics?days=7`).set(authHeaders);
    const other = await request(app).get(`/api/repositories/${REPO_ID}/analytics?days=30`).set(authHeaders);
    const overview = await request(app).get(`/api/repositories/${REPO_ID}/metrics?days=7`).set(authHeaders);
    expect(other.headers['x-cache']).toBe('MISS');
    expect(overview.headers['x-cache']).toBe('MISS');
  });

  it('checks repository access before reading the cache', async () => {
    store.set(cacheKeys.analytics(REPO_ID, 7), { secret: true });
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(false);
    const res = await request(app).get(`/api/repositories/${REPO_ID}/analytics?days=7`).set(authHeaders);
    expect(res.status).toBe(404);
    expect(fake.get).not.toHaveBeenCalled();
  });

  it('keeps serving analytics when Redis is down', async () => {
    fake.get.mockRejectedValue(new Error('down'));
    fake.set.mockRejectedValue(new Error('down'));
    const res = await request(app).get(`/api/repositories/${REPO_ID}/metrics?days=7`).set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('BYPASS');
    expect(res.body.data.metrics.prThroughput).toBe(1);
  });

  it('reports cache status in /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.data.cache).toBe('ok');
  });
});
