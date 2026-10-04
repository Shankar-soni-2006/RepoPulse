import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { toGitHubError } from '../src/services/github/octokit.js';
import { GitHubError } from '../src/utils/errors.js';
import { repositoryRepository } from '../src/repositories/repositoryRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { accessRepository } from '../src/repositories/accessRepository.js';
import { authHeaders, REPO_ID, testSession, testUser } from './helpers.js';

// Spec scenarios "failed GitHub requests" and "database errors"

vi.mock('../src/repositories/repositoryRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('../src/repositories/accessRepository.js');

describe('failed GitHub requests are mapped to stable API errors', () => {
  const octokitError = (status: number, headers: Record<string, string> = {}) =>
    Object.assign(new Error('HttpError'), { status, response: { headers } });

  it.each([
    ['429 Too Many Requests', octokitError(429), 'GITHUB_RATE_LIMITED', 503],
    ['403 with an exhausted rate limit', octokitError(403, { 'x-ratelimit-remaining': '0' }), 'GITHUB_RATE_LIMITED', 503],
    ['401 bad credentials', octokitError(401), 'GITHUB_UNAUTHORIZED', 401],
    ['403 forbidden', octokitError(403, { 'x-ratelimit-remaining': '4999' }), 'GITHUB_FORBIDDEN', 403],
    ['404 not found', octokitError(404), 'GITHUB_NOT_FOUND', 404],
    ['500 server error', octokitError(500), 'GITHUB_ERROR', 502],
    ['network failure (no status)', new Error('ECONNRESET'), 'GITHUB_ERROR', 502],
  ])('%s → %s', (_label, err, code, status) => {
    const mapped = toGitHubError(err, 'Failed to fetch repository acme/api');
    expect(mapped).toBeInstanceOf(GitHubError);
    expect(mapped).toMatchObject({ code, statusCode: status });
    expect(mapped.message).toMatch(/^Failed to fetch repository acme\/api: /);
  });

  it('passes an already-mapped error through unchanged', () => {
    const original = new GitHubError('x', 404, 'GITHUB_NOT_FOUND', 404);
    expect(toGitHubError(original, 'ignored')).toBe(original);
  });
});

describe('database errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sessionRepository.touch).mockResolvedValue();
    vi.mocked(accessRepository.hasRepositoryAccess).mockResolvedValue(true);
  });

  it('return 500 in the error envelope without leaking database details', async () => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockResolvedValue({ session: testSession(), user: testUser });
    vi.mocked(repositoryRepository.findAllForUser).mockRejectedValue({
      code: '42P01',
      message: 'relation "repositories" does not exist',
    });
    const res = await request(app).get('/api/repositories').set(authHeaders);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/relation|42P01/);
  });

  it('fail closed when the session store is unavailable', async () => {
    vi.mocked(sessionRepository.findValidByTokenHash).mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get(`/api/repositories/${REPO_ID}`).set(authHeaders);
    expect(res.status).toBe(500);
    expect(repositoryRepository.findById).not.toHaveBeenCalled();
  });

  it('keep the health endpoint up (it does not touch the database)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});
