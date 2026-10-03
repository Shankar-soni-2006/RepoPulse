import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

// Foundation tests: response envelope, routing and input validation.
// None of these reach Supabase or GitHub — validation rejects before any I/O.

describe('GET /api/health', () => {
  it('returns the success envelope', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404 in the error envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});

describe('route parameter validation', () => {
  const invalidIdPaths = [
    ['GET', '/api/repositories/not-a-uuid'],
    ['POST', '/api/repositories/not-a-uuid/sync'],
    ['GET', '/api/repositories/not-a-uuid/pull-requests'],
    ['GET', '/api/repositories/not-a-uuid/contributors'],
    ['GET', '/api/repositories/not-a-uuid/analytics'],
    ['GET', '/api/pull-requests/not-a-uuid'],
  ] as const;

  it.each(invalidIdPaths)('%s %s rejects a non-UUID id with 400', async (method, path) => {
    const res = method === 'GET' ? await request(app).get(path) : await request(app).post(path);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('query validation', () => {
  const repoId = '00000000-0000-4000-8000-000000000000';

  it('rejects an unsupported analytics period', async () => {
    const res = await request(app).get(`/api/repositories/${repoId}/analytics?days=14`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('days');
  });

  it('rejects an unknown pull request status', async () => {
    const res = await request(app).get(`/api/repositories/${repoId}/pull-requests?status=draft`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('body validation', () => {
  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/ai/insights')
      .set('Content-Type', 'application/json')
      .send('{"repositoryId": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects an AI request without a valid repositoryId', async () => {
    const res = await request(app)
      .post('/api/ai/insights')
      .send({ repositoryId: 'nope', period: { from: 'a', to: 'b' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
