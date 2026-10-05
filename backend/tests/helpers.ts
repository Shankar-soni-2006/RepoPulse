import type { Session, User } from '../src/types/index.js';

// Shared fixtures for API tests. Repository modules are mocked per test file
// with vi.mock(); these helpers only build data and headers.

export const TEST_SESSION_TOKEN = 'test-session-token';
export const REPO_ID = '00000000-0000-4000-8000-000000000001';
export const PR_ID = '00000000-0000-4000-8000-000000000002';

export const testUser: User = {
  id: '00000000-0000-4000-8000-0000000000aa',
  githubId: 42,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: null,
  role: 'member',
  suspendedAt: null,
};

export const testAdmin: User = { ...testUser, id: '00000000-0000-4000-8000-0000000000ad', login: 'admin-cat', role: 'admin' };

export function testSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '00000000-0000-4000-8000-0000000000bb',
    userId: testUser.id,
    encryptedAccessToken: 'unused',
    accessTokenExpiresAt: null,
    encryptedRefreshToken: null,
    refreshTokenExpiresAt: null,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

// Headers a signed-in browser request from the frontend carries
export const authHeaders = {
  Cookie: `rp_session=${TEST_SESSION_TOKEN}`,
  'X-RepoPulse-Client': 'web',
};
