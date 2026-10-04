import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { escapeLike, pullRequestRepository } from '../src/repositories/pullRequestRepository.js';
import { reviewRepository } from '../src/repositories/reviewRepository.js';
import { webhookEventRepository } from '../src/repositories/webhookEventRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import type { PullRequest, Review } from '../src/types/index.js';
import { authHeaders, PR_ID, REPO_ID, testSession, testUser } from './helpers.js';

// Endpoints added for the frontend pages: PR list sorting/search, PR detail, webhook events

vi.mock('../src/repositories/pullRequestRepository.js', async (orig) => {
  const actual = await orig<typeof import('../src/repositories/pullRequestRepository.js')>();
  return { ...actual, pullRequestRepository: { findByRepository: vi.fn(), findById: vi.fn() } };
});
vi.mock('../src/repositories/reviewRepository.js');
vi.mock('../src/repositories/webhookEventRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession(), user: testUser });
  vi.mocked(sessionRepository.touch).mockResolvedValue();
  vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
  vi.mocked(pullRequestRepository.findByRepository).mockResolvedValue({ items: [], total: 0 });
});

describe('escapeLike', () => {
  it('makes LIKE wildcards literal', () => {
    const bs = String.fromCharCode(92); // backslash
    expect(escapeLike(`50%_off${bs}x`)).toBe(`50${bs}%${bs}_off${bs}${bs}x`);
  });
});

describe('GET /api/repositories/:id/pull-requests', () => {
  const list = (qs: string) => request(app).get(`/api/repositories/${REPO_ID}/pull-requests${qs}`).set(authHeaders);

  it('defaults to newest first, 25 per page', async () => {
    await list('');
    expect(pullRequestRepository.findByRepository).toHaveBeenCalledWith(
      REPO_ID,
      expect.objectContaining({ sort: 'created', order: 'desc', page: 1, limit: 25 }),
    );
  });

  it('passes sort, order, search and filters through', async () => {
    await list('?sort=cycleTime&order=asc&search=%23142&status=merged&from=2026-09-01&page=2&limit=50');
    expect(pullRequestRepository.findByRepository).toHaveBeenCalledWith(REPO_ID, {
      sort: 'cycleTime', order: 'asc', search: '#142', status: 'merged', from: '2026-09-01', page: 2, limit: 50,
    });
  });

  it.each([
    ['unknown sort', '?sort=author'],
    ['invalid date', '?from=yesterday'],
    ['page size over 100', '?limit=500'],
  ])('rejects %s', async (_label, qs) => {
    const res = await list(qs);
    expect(res.status).toBe(400);
    expect(pullRequestRepository.findByRepository).not.toHaveBeenCalled();
  });
});

describe('GET /api/pull-requests/:id', () => {
  it('includes the PR’s reviews', async () => {
    vi.mocked(pullRequestRepository.findById).mockResolvedValue({ id: PR_ID, repositoryId: REPO_ID, number: 7 } as PullRequest);
    vi.mocked(reviewRepository.findByPullRequest).mockResolvedValue([{ id: 'r1', state: 'approved' } as Review]);
    const res = await request(app).get(`/api/pull-requests/${PR_ID}`).set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ number: 7, reviews: [{ id: 'r1', state: 'approved' }] });
  });
});

describe('GET /api/repositories/:id/webhook-events', () => {
  it('lists recent deliveries for the repository', async () => {
    vi.mocked(webhookEventRepository.findRecentForRepository).mockResolvedValue([]);
    const res = await request(app).get(`/api/repositories/${REPO_ID}/webhook-events?limit=5`).set(authHeaders);
    expect(res.status).toBe(200);
    expect(webhookEventRepository.findRecentForRepository).toHaveBeenCalledWith(REPO_ID, 5);
  });

  it('requires repository access', async () => {
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(false);
    const res = await request(app).get(`/api/repositories/${REPO_ID}/webhook-events`).set(authHeaders);
    expect(res.status).toBe(404);
    expect(webhookEventRepository.findRecentForRepository).not.toHaveBeenCalled();
  });
});
