import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { verifySignature, sign } from '../src/webhooks/signature.js';
import { webhookService } from '../src/webhooks/webhookService.js';
import { webhookEventRepository } from '../src/repositories/webhookEventRepository.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { analyticsRepository } from '../src/repositories/analyticsRepository.js';
import { GitHubService } from '../src/services/github/githubService.js';
import * as ingest from '../src/services/sync/ingest.js';
import type { Repository, WebhookEvent } from '../src/types/index.js';
import { cacheService } from '../src/services/cache/cacheService.js';
import { REPO_ID } from './helpers.js';

vi.mock('../src/repositories/webhookEventRepository.js');
vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/analyticsRepository.js');
vi.mock('../src/services/github/githubService.js');
vi.mock('../src/services/sync/ingest.js');

const SECRET = 'test-webhook-secret'; // vitest.config.mts GITHUB_WEBHOOK_SECRET
const NOW = new Date('2026-10-03T12:00:00.000Z');

const repo = {
  id: REPO_ID,
  githubId: 555,
  defaultBranch: 'main',
  lastSyncedAt: '2026-10-03T11:00:00.000Z',
  dataSince: '2026-04-06T12:00:00.000Z',
} as Repository;

const repositoryPayload = { id: 555, name: 'api', owner: { login: 'acme' } };

function event(eventType: string, payload: Record<string, unknown>, overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 'evt-1',
    repositoryId: REPO_ID,
    eventType,
    action: (payload.action as string) ?? null,
    githubDeliveryId: 'delivery-1',
    payload,
    status: 'received',
    processingError: null,
    processedAt: null,
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

let github: { compareCommits: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
  github = { compareCommits: vi.fn() };
  vi.mocked(GitHubService).mockImplementation(function () {
    return github as unknown as GitHubService;
  } as unknown as typeof GitHubService);
  vi.mocked(repositoryRepository.findById).mockResolvedValue(repo);
  vi.mocked(repositoryRepository.findByGithubId).mockResolvedValue(repo);
  vi.mocked(repositoryRepository.findInstallationGithubId).mockResolvedValue(777);
  vi.mocked(analyticsRepository.refreshDailyMetrics).mockResolvedValue(10);
  vi.mocked(ingest.fetchPullRequests).mockResolvedValue([
    { pr: { created_at: '2026-09-20T08:00:00Z' } as never, reviews: [] },
  ]);
  vi.mocked(ingest.storeActivity).mockResolvedValue({ reviews: 0 });
  vi.mocked(ingest.backfillCommitStats).mockResolvedValue(1);
  for (const m of ['markProcessing', 'markProcessed', 'markIgnored', 'markFailed'] as const) {
    vi.mocked(webhookEventRepository[m]).mockResolvedValue();
  }
});

describe('verifySignature', () => {
  const body = Buffer.from('{"zen":"Keep it logically awesome."}');

  it('accepts GitHub’s sha256 HMAC of the exact body', () => {
    expect(verifySignature(SECRET, body, sign(SECRET, body))).toBe(true);
  });

  it.each([
    ['missing header', undefined],
    ['wrong prefix', sign(SECRET, body).replace('sha256=', 'sha1=')],
    ['wrong secret', sign('other-secret', body)],
    ['truncated', sign(SECRET, body).slice(0, 20)],
    ['not hex', 'sha256=zzzz'],
  ])('rejects %s', (_label, header) => {
    expect(verifySignature(SECRET, body, header)).toBe(false);
  });

  it('rejects a body changed after signing', () => {
    expect(verifySignature(SECRET, Buffer.from('{"zen":"tampered"}'), sign(SECRET, body))).toBe(false);
  });
});

describe('POST /api/webhooks/github', () => {
  const body = JSON.stringify({ action: 'opened', repository: repositoryPayload, pull_request: { number: 7 } });

  const deliver = (overrides: Record<string, string> = {}, payload = body) =>
    request(app)
      .post('/api/webhooks/github')
      .set({
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
        'X-GitHub-Delivery': 'delivery-1',
        'X-Hub-Signature-256': sign(SECRET, payload),
        ...overrides,
      })
      .send(payload);

  it('records a correctly signed delivery and acknowledges with 202', async () => {
    vi.mocked(webhookEventRepository.create).mockResolvedValue(event('pull_request', JSON.parse(body)));
    const processSpy = vi.spyOn(webhookService, 'process').mockResolvedValue('processed');
    const res = await deliver();
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { deliveryId: 'delivery-1', status: 'accepted' } });
    expect(webhookEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ repository_id: REPO_ID, event_type: 'pull_request', action: 'opened', github_delivery_id: 'delivery-1' }),
    );
    processSpy.mockRestore();
  });

  it('acknowledges a redelivery without reprocessing', async () => {
    vi.mocked(webhookEventRepository.create).mockResolvedValue(null);
    const res = await deliver();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('duplicate');
  });

  it('rejects a bad signature without recording anything', async () => {
    const res = await deliver({ 'X-Hub-Signature-256': sign('wrong', body) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(webhookEventRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an unsigned delivery', async () => {
    const res = await request(app)
      .post('/api/webhooks/github')
      .set({ 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-GitHub-Delivery': 'd' })
      .send(body);
    expect(res.status).toBe(401);
  });

  it('explains a form-encoded webhook configuration', async () => {
    const res = await deliver({ 'Content-Type': 'application/x-www-form-urlencoded' }, 'payload=%7B%7D');
    expect(res.status).toBe(415);
    expect(res.body.error.message).toMatch(/application\/json/);
  });

  it('requires GitHub’s event and delivery headers', async () => {
    const res = await request(app)
      .post('/api/webhooks/github')
      .set({ 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(SECRET, body) })
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEBHOOK_HEADERS_MISSING');
  });

  it('needs no session cookie or CSRF header', async () => {
    vi.mocked(webhookEventRepository.create).mockResolvedValue(null);
    const res = await deliver();
    expect(res.status).toBe(200);
  });
});

describe('webhookService.process', () => {
  it('updates only the PR named by a pull_request event, then refreshes metrics from its creation', async () => {
    const status = await webhookService.process(
      event('pull_request', { action: 'closed', repository: repositoryPayload, pull_request: { number: 7, created_at: '2026-09-20T08:00:00Z' } }),
      NOW,
    );
    expect(status).toBe('processed');
    expect(GitHubService).toHaveBeenCalledWith(777);
    expect(ingest.fetchPullRequests).toHaveBeenCalledWith(github, { owner: 'acme', name: 'api' }, [7]);
    expect(ingest.storeActivity).toHaveBeenCalledWith(REPO_ID, expect.any(Array), []);
    expect(analyticsRepository.refreshDailyMetrics).toHaveBeenCalledWith(REPO_ID, '2026-09-20', '2026-10-03');
    expect(webhookEventRepository.markProcessing).toHaveBeenCalledWith('evt-1');
    expect(webhookEventRepository.markProcessed).toHaveBeenCalledWith('evt-1');
  });

  it('invalidates cached analytics once the update is stored', async () => {
    const invalidate = vi.spyOn(cacheService, 'invalidateRepository');
    await webhookService.process(
      event('pull_request', { action: 'opened', repository: repositoryPayload, pull_request: { number: 7, created_at: '2026-09-20T08:00:00Z' } }),
      NOW,
    );
    expect(invalidate).toHaveBeenCalledWith(REPO_ID);
    invalidate.mockRestore();
  });

  it('handles review events the same way (reviews come with the PR)', async () => {
    await webhookService.process(
      event('pull_request_review', { action: 'submitted', repository: repositoryPayload, pull_request: { number: 9, created_at: '2026-09-20T08:00:00Z' }, review: {} }),
      NOW,
    );
    expect(ingest.fetchPullRequests).toHaveBeenCalledWith(github, { owner: 'acme', name: 'api' }, [9]);
    expect(webhookEventRepository.markProcessed).toHaveBeenCalled();
  });

  it('never refreshes metrics before the start of synced data', async () => {
    vi.mocked(ingest.fetchPullRequests).mockResolvedValue([{ pr: { created_at: '2025-01-01T00:00:00Z' } as never, reviews: [] }]);
    await webhookService.process(
      event('pull_request', { action: 'edited', repository: repositoryPayload, pull_request: { number: 1, created_at: '2025-01-01T00:00:00Z' } }),
      NOW,
    );
    expect(analyticsRepository.refreshDailyMetrics).toHaveBeenCalledWith(REPO_ID, '2026-04-06', '2026-10-03');
  });

  describe('push', () => {
    const push = (overrides: Record<string, unknown> = {}) =>
      event('push', {
        ref: 'refs/heads/main',
        before: 'a'.repeat(40),
        after: 'b'.repeat(40),
        repository: repositoryPayload,
        ...overrides,
      });

    it('stores the new default-branch commits and their stats', async () => {
      github.compareCommits.mockResolvedValue([
        { sha: 'c2', commit: { author: { date: '2026-10-02T09:00:00Z' } }, parents: [{}] },
        { sha: 'c1', commit: { author: { date: '2026-10-01T09:00:00Z' } }, parents: [{}] },
      ]);
      expect(await webhookService.process(push(), NOW)).toBe('processed');
      expect(github.compareCommits).toHaveBeenCalledWith('acme', 'api', 'a'.repeat(40), 'b'.repeat(40));
      expect(ingest.storeActivity).toHaveBeenCalledWith(REPO_ID, [], expect.arrayContaining([expect.objectContaining({ sha: 'c1' })]));
      expect(ingest.backfillCommitStats).toHaveBeenCalledWith(github, REPO_ID, { owner: 'acme', name: 'api' }, 2);
      expect(analyticsRepository.refreshDailyMetrics).toHaveBeenCalledWith(REPO_ID, '2026-10-01', '2026-10-03');
    });

    it.each([
      ['another branch', { ref: 'refs/heads/feature' }, /not the default branch/],
      ['a branch deletion', { deleted: true }, /Branch deletion/],
      ['a branch creation', { before: '0'.repeat(40) }, /Branch creation/],
    ])('ignores %s', async (_label, overrides, reason) => {
      expect(await webhookService.process(push(overrides), NOW)).toBe('ignored');
      expect(webhookEventRepository.markIgnored).toHaveBeenCalledWith('evt-1', expect.stringMatching(reason));
      expect(ingest.storeActivity).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['an unused event type', event('issues', { action: 'opened' }), /not used/],
    ['an untracked repository', event('pull_request', {}, { repositoryId: null }), /not tracked/],
  ])('ignores %s', async (_label, evt, reason) => {
    expect(await webhookService.process(evt, NOW)).toBe('ignored');
    expect(webhookEventRepository.markIgnored).toHaveBeenCalledWith('evt-1', expect.stringMatching(reason));
  });

  it('ignores events for a repository that was never synced (the first sync imports them)', async () => {
    vi.mocked(repositoryRepository.findById).mockResolvedValue({ ...repo, lastSyncedAt: null, dataSince: null });
    expect(
      await webhookService.process(event('pull_request', { action: 'opened', repository: repositoryPayload, pull_request: { number: 1, created_at: 'x' } }), NOW),
    ).toBe('ignored');
    expect(ingest.fetchPullRequests).not.toHaveBeenCalled();
  });

  it('records failures without throwing, hiding internal details', async () => {
    vi.mocked(ingest.storeActivity).mockRejectedValue({ message: 'relation does not exist' });
    const status = await webhookService.process(
      event('pull_request', { action: 'opened', repository: repositoryPayload, pull_request: { number: 7, created_at: '2026-09-20T08:00:00Z' } }),
      NOW,
    );
    expect(status).toBe('failed');
    expect(webhookEventRepository.markFailed).toHaveBeenCalledWith('evt-1', 'Processing failed due to an internal error');
    expect(webhookEventRepository.markProcessed).not.toHaveBeenCalled();
  });
});
