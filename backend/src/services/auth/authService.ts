import { env } from '../../config/env.js';
import { userRepository } from '../../repositories/userRepository.js';
import { installationRepository } from '../../repositories/installationRepository.js';
import type { SessionInfo, User } from '../../types/index.js';
import { discoverForUser } from '../github/discoveryService.js';
import { createAppOctokit, createUserOctokit, toGitHubError } from '../github/octokit.js';
import { sessionService } from './sessionService.js';
import { supabaseOAuth } from './supabaseOAuth.js';

let installUrlCache: Promise<string | null> | null = null;

/** GitHub's settings page for one installation (repository access: all or selected) */
export function installationManageUrl(i: { installationId: number; accountLogin: string; accountType: 'User' | 'Organization' }): string {
  return i.accountType === 'Organization'
    ? `https://github.com/organizations/${encodeURIComponent(i.accountLogin)}/settings/installations/${i.installationId}`
    : `https://github.com/settings/installations/${i.installationId}`;
}

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
  /**
   * Starts GitHub sign-in through Supabase Auth. Returns the URL to send the browser to
   * and the sealed PKCE state the callback needs (stored in a cookie).
   */
  beginLogin(): Promise<{ url: string; flow: string }> {
    return supabaseOAuth.start(`${env.BACKEND_URL}/api/auth/callback`);
  },

  /** Exchanges the callback code (via Supabase), records the user, opens a session. Returns the session cookie token. */
  async completeLogin(code: string, flow: string): Promise<string> {
    const tokens = await supabaseOAuth.exchange(code, flow);

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
        manageUrl: installationManageUrl(i),
      })),
      installUrl,
    };
  },
};
