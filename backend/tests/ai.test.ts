import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { aiService } from '../src/services/ai/aiService.js';
import { buildAIContext, formatDuration } from '../src/services/ai/context.js';
import { Grounding } from '../src/services/ai/grounding.js';
import { completeJson, configuredProviders } from '../src/services/ai/provider.js';
import { analyticsService } from '../src/services/analytics/analyticsService.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { pullRequestRepository } from '../src/repositories/pullRequestRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import type { MetricsSummary, PeriodMetrics, Repository } from '../src/types/index.js';
import { authHeaders, REPO_ID, testSession, testUser } from './helpers.js';

vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/pullRequestRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');

function metrics(o: Partial<PeriodMetrics> = {}): PeriodMetrics {
  return {
    prThroughput: 12, prsOpened: 14, cycleTime: 25.4, firstReviewTime: 4.8, reviewDelay: 7.25, prSize: 341,
    codeChurn: 8200, additions: 6000, deletions: 2200, commitCount: 60, reviewCount: 30, activeContributors: 5,
    openPrsWithoutReview: 2, oldestUnreviewedWait: 50, commitsMissingStats: 0, ...o,
  };
}

const summary: MetricsSummary = {
  repositoryId: REPO_ID,
  period: { from: '2026-09-03T12:00:00.000Z', to: '2026-10-03T12:00:00.000Z', days: 30 },
  previousPeriod: { from: '2026-08-04T12:00:00.000Z', to: '2026-09-03T12:00:00.000Z' },
  metrics: metrics(),
  previousMetrics: metrics({ cycleTime: 20, firstReviewTime: 3.1, prSize: 214 }),
  changes: { prThroughput: 0, prsOpened: 0, cycleTime: 0.27, firstReviewTime: 0.548, reviewDelay: 0, prSize: 0.593,
    codeChurn: 0, commitCount: 0, reviewCount: 0, activeContributors: 0 },
  dataQuality: { dataSince: '2026-04-06', lastSyncedAt: '2026-10-03', commitStatsCoverage: 1,
    limitations: ['Commits are counted on the default branch only. Days are in UTC.'] },
  generatedAt: '2026-10-03T12:00:00.000Z',
};

const evidence = {
  slowestMerged: [{ number: 142, title: 'Fix authentication', prSize: 420, cycleTime: 31.5, firstReviewTime: 9, reviewCount: 2, createdAt: '2026-09-10T00:00:00Z', mergedAt: '2026-09-11T07:30:00Z' }],
  largestMerged: [],
  awaitingReview: [],
};

const goodAnswer = {
  summary: 'Cycle time rose to 1.1d (+27%) while median PR size grew from 214 to 341 lines.',
  insights: [
    {
      title: 'Longer cycle time',
      type: 'trend',
      severity: 'medium',
      fact: 'Median cycle time increased by 27% to 1.1d.',
      evidence: ['Median PR size increased from 214 to 341 lines.', 'First-review time increased from 3.1h to 4.8h.'],
      possibleExplanation: 'Larger PRs may be contributing to longer review cycles.',
      recommendedInvestigation: 'Review large PRs merged in the period, such as PR #142.',
    },
  ],
  dataLimitations: [],
};

/** Stubbed OpenAI-compatible endpoint: one queued reply per call */
function mockProviders(...replies: Array<{ status?: number; content?: unknown; error?: string }>) {
  const fetchMock = vi.fn(async () => {
    const r = replies.shift() ?? { status: 500, error: 'no more replies' };
    const status = r.status ?? 200;
    const body = status === 200
      ? { choices: [{ message: { content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content) }, finish_reason: 'stop' }] }
      : { error: { message: r.error ?? `HTTP ${status}` } };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function configure(primary = true, fallback = true) {
  env.AI_API_KEY = primary ? 'groq-key' : undefined;
  env.AI_FALLBACK_API_KEY = fallback ? 'cerebras-key' : undefined;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  aiService.resetUserLimitsForTests();
  configure();
  vi.mocked(repositoryRepository.findById).mockResolvedValue({ id: REPO_ID, fullName: 'acme/api', lastSyncedAt: '2026-10-03' } as Repository);
  vi.mocked(pullRequestRepository.findPeriodEvidence).mockResolvedValue(evidence);
  vi.spyOn(analyticsService, 'getMetrics').mockResolvedValue(summary);
});

afterEach(() => {
  configure(false, false);
  vi.unstubAllGlobals();
});

const ask = (mode: 'summary' | 'question' = 'summary', question?: string) =>
  aiService.getInsights({ userId: 'u1', repositoryId: REPO_ID, days: 30, mode, question });

describe('Grounding', () => {
  const g = new Grounding(buildAIContext('acme/api', summary, evidence));

  it('accepts numbers from the data, including rounded forms', () => {
    expect(g.ungrounded('Cycle time 1.1d, up 27% (27.0%), size 214 → 341 lines, PR #142, 4.8h, 8,200 lines')).toEqual([]);
  });

  it('accepts dates and percentages derived by the backend', () => {
    expect(g.ungrounded('Since 2026-09-03 first-review time rose 54.8%')).toEqual([]);
  });

  it('rejects numbers that are not in the data', () => {
    expect(g.ungrounded('Cycle time rose 35% to 2.3d across 17 PRs')).toEqual(['35', '2.3', '17']);
  });

  it('does not accept a rounded value outside the stated precision', () => {
    expect(g.ungrounded('PR size 342')).toEqual(['342']); // 341 rounds to 341, not 342
  });
});

describe('context', () => {
  it('formats durations in readable units', () => {
    expect([formatDuration(0.0032), formatDuration(0.5), formatDuration(4.84), formatDuration(31.5), formatDuration(null)])
      .toEqual(['12s', '30m', '4.8h', '1.3d', null]);
  });

  it('passes precomputed percentages and no author data', () => {
    const ctx = buildAIContext('acme/api', summary, evidence);
    expect(ctx.changesVsPreviousPeriod.cycleTime).toEqual({ previous: 20, current: 25.4, changePercent: 27 });
    // PR evidence carries no people: no author fields or logins
    expect(JSON.stringify(ctx)).not.toMatch(/author_?login|"author"/i);
    expect(ctx.evidence[0]).toBe('Slowest merged: PR #142 "Fix authentication", merged after 1.3d, 420 lines changed, first review after 9.0h, 2 reviews');
  });
});

describe('provider client', () => {
  it('sends an OpenAI-compatible request with a strict JSON schema', async () => {
    const fetchMock = mockProviders({ content: goodAnswer });
    const [groq] = configuredProviders();
    await completeJson(groq, [{ role: 'user', content: 'hi' }], { type: 'object' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer groq-key');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_schema', json_schema: { strict: true } } });
  });

  it('lists the primary first and skips providers without a key', () => {
    expect(configuredProviders().map((p) => p.name)).toEqual(['api.groq.com', 'api.cerebras.ai']);
    configure(false, true);
    expect(configuredProviders().map((p) => p.name)).toEqual(['api.cerebras.ai']);
  });
});

describe('aiService.getInsights', () => {
  it('returns validated insights and records which provider answered', async () => {
    mockProviders({ content: goodAnswer });
    const result = await ask();
    expect(result.insights).toHaveLength(1);
    expect(result.meta).toMatchObject({ provider: 'api.groq.com', model: 'openai/gpt-oss-120b', rejectedInsights: 0, cached: false });
    expect(result.dataLimitations).toContain('Commits are counted on the default branch only. Days are in UTC.');
  });

  it('falls back to the second provider when the first is rate-limited', async () => {
    const fetchMock = mockProviders({ status: 429, error: 'rate limit' }, { content: goodAnswer });
    const result = await ask();
    expect(result.meta.provider).toBe('api.cerebras.ai');
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe('https://api.cerebras.ai/v1/chat/completions');
  });

  it('falls back when the first answer is malformed', async () => {
    mockProviders({ content: 'not json' }, { content: goodAnswer });
    expect((await ask()).meta.provider).toBe('api.cerebras.ai');
  });

  it('rejects an answer whose summary invents numbers', async () => {
    mockProviders(
      { content: { ...goodAnswer, summary: 'Cycle time rose 45% across 19 PRs.' } },
      { content: { ...goodAnswer, summary: 'Cycle time rose 45% across 19 PRs.' } },
    );
    await expect(ask()).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
  });

  it('drops individual insights that invent numbers and says so', async () => {
    const invented = { ...goodAnswer.insights[0], title: 'Made up', fact: 'Deployment frequency fell to 17 per week.' };
    mockProviders({ content: { ...goodAnswer, insights: [goodAnswer.insights[0], invented] } });
    const result = await ask();
    expect(result.insights.map((i) => i.title)).toEqual(['Longer cycle time']);
    expect(result.meta.rejectedInsights).toBe(1);
    expect(result.dataLimitations.at(-1)).toMatch(/1 AI insight was removed/);
  });

  it('reports rate limiting when every provider is at its limit', async () => {
    mockProviders({ status: 429 }, { status: 429 });
    await expect(ask()).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', statusCode: 429 });
  });

  it('reports unavailability on provider outages', async () => {
    mockProviders({ status: 500 }, { status: 503 });
    await expect(ask()).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
  });

  it('reports when no provider is configured, without calling anything', async () => {
    configure(false, false);
    const fetchMock = mockProviders();
    await expect(ask()).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call the AI for a repository that was never synced', async () => {
    vi.mocked(repositoryRepository.findById).mockResolvedValue({ id: REPO_ID, lastSyncedAt: null } as Repository);
    const fetchMock = mockProviders();
    await expect(ask()).rejects.toMatchObject({ code: 'AI_NO_DATA', statusCode: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call the AI when there is no activity to analyze', async () => {
    const empty = metrics({ prThroughput: 0, prsOpened: 0, commitCount: 0, reviewCount: 0 });
    vi.spyOn(analyticsService, 'getMetrics').mockResolvedValue({ ...summary, metrics: empty, previousMetrics: empty });
    const fetchMock = mockProviders();
    await expect(ask()).rejects.toMatchObject({ code: 'AI_NO_ACTIVITY', statusCode: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('includes the question for question mode', async () => {
    const fetchMock = mockProviders({ content: goodAnswer });
    await ask('question', 'Why are reviews taking longer?');
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[1].content).toContain('Why are reviews taking longer?');
  });

  it('limits provider calls per user per hour', async () => {
    for (let i = 0; i < 20; i++) {
      mockProviders({ content: goodAnswer });
      await ask();
    }
    mockProviders({ content: goodAnswer });
    await expect(ask()).rejects.toMatchObject({ code: 'AI_USER_LIMIT', statusCode: 429 });
  });
});

describe('POST /api/ai/insights', () => {
  beforeEach(() => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession(), user: testUser });
    vi.mocked(sessionRepository.touch).mockResolvedValue();
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
  });

  it('returns insights in the API envelope', async () => {
    mockProviders({ content: goodAnswer });
    const res = await request(app).post('/api/ai/insights').set(authHeaders).send({ repositoryId: REPO_ID, mode: 'summary', days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBe(goodAnswer.summary);
  });

  it('requires a question in question mode', async () => {
    const res = await request(app).post('/api/ai/insights').set(authHeaders).send({ repositoryId: REPO_ID, mode: 'question' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/question is required/);
  });

  it('rejects unknown modes', async () => {
    const res = await request(app).post('/api/ai/insights').set(authHeaders).send({ repositoryId: REPO_ID, mode: 'predict' });
    expect(res.status).toBe(400);
  });

  it('keeps analytics working when the AI is down', async () => {
    mockProviders({ status: 500 }, { status: 500 });
    const ai = await request(app).post('/api/ai/insights').set(authHeaders).send({ repositoryId: REPO_ID, mode: 'summary' });
    expect(ai.status).toBe(503);
    vi.unstubAllGlobals();
    const metricsRes = await request(app).get(`/api/repositories/${REPO_ID}/metrics`).set(authHeaders);
    expect(metricsRes.status).toBe(200);
  });
});
