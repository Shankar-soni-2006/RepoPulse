import { githubApp } from '../../config/github.js';
import { sessionRepository } from '../../repositories/sessionRepository.js';
import type { Session, User } from '../../types/index.js';
import { decryptSecret, encryptSecret, generateToken, hashToken } from '../../utils/crypto.js';
import { UnauthorizedError } from '../../utils/errors.js';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Tokens from GitHub's web flow. GitHub Apps with "expire user tokens" enabled
// return an 8h access token plus a refresh token.
export interface GitHubUserTokens {
  token: string;
  expiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
}

function encryptTokens(tokens: GitHubUserTokens) {
  return {
    encrypted_access_token: encryptSecret(tokens.token),
    access_token_expires_at: tokens.expiresAt ?? null,
    encrypted_refresh_token: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    refresh_token_expires_at: tokens.refreshTokenExpiresAt ?? null,
  };
}

const reauthRequired = () =>
  new UnauthorizedError('GitHub authorization expired. Sign in again.', 'GITHUB_REAUTH_REQUIRED');

// Refresh tokens are single-use: concurrent requests for one session share one refresh
const refreshesInFlight = new Map<string, Promise<string>>();

async function refreshAccessToken(session: Session): Promise<string> {
  if (
    !session.encryptedRefreshToken ||
    (session.refreshTokenExpiresAt && Date.parse(session.refreshTokenExpiresAt) <= Date.now())
  ) {
    throw reauthRequired();
  }

  try {
    const { authentication } = await githubApp.oauth.refreshToken({
      refreshToken: decryptSecret(session.encryptedRefreshToken),
    });
    await sessionRepository.updateTokens(session.id, encryptTokens(authentication));
    return authentication.token;
  } catch (err) {
    console.warn(`[auth] token refresh failed for session ${session.id}:`, (err as Error).message);
    throw reauthRequired();
  }
}

export const sessionService = {
  /** Creates a session and returns the raw cookie token (only its hash is stored). */
  async create(userId: string, tokens: GitHubUserTokens): Promise<string> {
    const token = generateToken();
    await sessionRepository.deleteExpiredForUser(userId);
    await sessionRepository.create({
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
      ...encryptTokens(tokens),
    });
    return token;
  },

  async resolve(token: string): Promise<{ session: Session; user: User } | null> {
    return sessionRepository.findValidByTokenHash(hashToken(token));
  },

  /** The user's GitHub token, refreshed first if it is about to expire. */
  async getAccessToken(session: Session): Promise<string> {
    const expiresAt = session.accessTokenExpiresAt ? Date.parse(session.accessTokenExpiresAt) : null;
    if (expiresAt === null || expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return decryptSecret(session.encryptedAccessToken);
    }

    let pending = refreshesInFlight.get(session.id);
    if (!pending) {
      pending = refreshAccessToken(session).finally(() => refreshesInFlight.delete(session.id));
      refreshesInFlight.set(session.id, pending);
    }
    return pending;
  },

  destroy(sessionId: string): Promise<void> {
    return sessionRepository.deleteById(sessionId);
  },
};
