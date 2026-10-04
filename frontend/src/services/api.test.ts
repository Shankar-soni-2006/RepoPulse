import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiRequestError } from './api';

const respond = (body: unknown, status = 200, type = 'application/json') =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } })),
  );

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('unwraps the success envelope', async () => {
    respond({ success: true, data: { ok: 1 } });
    await expect(api.get('/api/x')).resolves.toEqual({ ok: 1 });
  });

  it('sends cookies and the CSRF client header', async () => {
    respond({ success: true, data: null });
    await api.post('/api/x', { a: 1 });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-RepoPulse-Client']).toBe('web');
    expect(init.body).toBe('{"a":1}');
  });

  it('keeps the backend error code and HTTP status', async () => {
    respond({ success: false, error: { code: 'SYNC_IN_PROGRESS', message: 'A sync is already running' } }, 409);
    await expect(api.post('/api/x')).rejects.toMatchObject({ code: 'SYNC_IN_PROGRESS', status: 409, message: 'A sync is already running' });
  });

  it('reports non-JSON gateway pages clearly', async () => {
    respond('<html>Bad Gateway</html>', 502, 'text/html');
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 502 });
  });

  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await api.get('/api/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
