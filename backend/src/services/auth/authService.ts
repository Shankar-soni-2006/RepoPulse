import { env } from '../../config/env.js';
import { githubApp } from '../../config/github.js';
import { userRepository } from '../../repositories/userRepository.js';
import { installationRepository } from '../../repositories/installationRepository.js';
import type { SessionInfo, User } from '../../types/index.js';
import { generateToken } from '../../utils/crypto.js';
import { AppError } from '../../utils/errors.js';
import { discoverForUser } from '../github/discoveryService.js';
import { createAppOctokit, createUserOctokit, toGitHubError } from '../github/octokit.js';
import { sessionService, type GitHubUserTokens } from './sessionService.js';

let installUrlCache: Promise<string | null> | null = null;

// https://github.com/apps/<slug>/installations/new — slug read from the App itself
function getInstallUrl(): Promise<string | null> {
  installUrlCache ??= createAppOctokit()
    .apps.getAuthenticated()
    .then(({ data }) => (data?.slug ? `https://github.com/apps/${data.slug}/installations/new` : null))
    .catch((err: Error) => {
      console.warn('[auth] could not resolve GitHub App slug:', err.message);
      installUrlCache = null; // retry on next request
      return null;
    });
  return installUrlCache;
}

export const authService = {
  /** GitHub authorize URL plus the CSRF state the callback must echo back. */
  beginLogin(): { url: string; state: string } {
    const state = generateToken(16);
    const { url } = githubApp.oauth.getWebFlowAuthorizationUrl({
      redirectUrl: `${env.BACKEND_URL}/api/auth/callback`,
      state,
    });
    return { url, state };
  },

  /** Exchanges the OAuth code, records the user, opens a session. Returns the session cookie token. */
  async completeLogin(code: string): Promise<string> {
    let tokens: GitHubUserTokens;
    try {
      const { authentication } = await githubApp.oauth.createToken({ code });
      tokens = authentication;
    } catch (err) {
      // GitHub answers a bad exchange with an OAuth error code (status 400)
      const oauthError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      if (oauthError === 'bad_verification_code') {
        // Code already used (e.g. the callback was requested twice) or expired
        throw new AppError('OAUTH_CODE_INVALID', 'The GitHub sign-in code was already used or has expired', 400);
      }
      if (oauthError) console.error(`[auth] GitHub code exchange failed: ${oauthError}`);
      throw toGitHubError(err, 'GitHub sign-in failed');
    }

    let ghUser;
    try {
      ({ data: ghUser } = await createUserOctokit(tokens.token).users.getAuthenticated());
    } catch (err) {
      throw toGitHubError(err, 'Failed to read GitHub profile');
    }

    const user = await userRepository.upsertFromGitHub({
      github_id: ghUser.id,
      login: ghUser.login,
      name: ghUser.name ?? null,
      email: ghUser.email ?? null,
      avatar_url: ghUser.avatar_url,
    });

    const sessionToken = await sessionService.create(user.id, tokens);

    // Sign-in shouldn't fail because discovery hit a transient GitHub error;
    // the repository page can re-run discovery.
    try {
      await discoverForUser(user.id, tokens.token);
    } catch (err) {
      console.error(`[auth] repository discovery failed for ${user.login}:`, (err as Error).message);
    }

    return sessionToken;
  },

  async getSessionInfo(user: User): Promise<SessionInfo> {
    const [installations, installUrl] = await Promise.all([
      installationRepository.findForUser(user.id),
      getInstallUrl(),
    ]);
    return {
      user: { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatarUrl },
      installations: installations.map((i) => ({
        id: i.id,
        accountLogin: i.accountLogin,
        accountType: i.accountType,
      })),
      installUrl,
    };
  },
};
