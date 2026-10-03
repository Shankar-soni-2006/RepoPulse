import { Request, Response, NextFunction } from 'express';
import { githubApp } from '../config/github';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import {
  setSession,
  deleteSession,
  generateSessionId,
  getSession,
} from '../middleware/session';
import { sendSuccess, sendError } from '../utils/response';

// Step 1: Redirect to GitHub OAuth
export function handleGithubLogin(_req: Request, res: Response): void {
  // GitHub Apps don't take OAuth scopes — permissions come from the App's configuration
  const { url } = githubApp.oauth.getWebFlowAuthorizationUrl({
    redirectUrl: `${env.BACKEND_URL}/api/auth/callback`,
  });
  res.redirect(url);
}

// Step 2: Handle OAuth callback
export async function handleGithubCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const code = req.query.code as string;
    if (!code) {
      sendError(res, 400, 'MISSING_CODE', 'Missing OAuth code');
      return;
    }

    // Exchange code for token
    const { authentication } = await githubApp.oauth.createToken({ code });
    const accessToken = authentication.token;

    // Get GitHub user
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: accessToken });
    const { data: ghUser } = await octokit.users.getAuthenticated();

    // Upsert user in DB
    const { data: user, error } = await supabase
      .from('users')
      .upsert(
        {
          github_id: ghUser.id,
          login: ghUser.login,
          name: ghUser.name ?? null,
          email: ghUser.email ?? null,
          avatar_url: ghUser.avatar_url,
        },
        { onConflict: 'github_id' },
      )
      .select()
      .single();

    if (error) throw error;

    // Get installations accessible to this user
    const { data: installationsData } = await octokit.apps.listInstallationsForAuthenticatedUser({
      per_page: 100,
    });
    const installations = installationsData.installations;

    // Upsert installations
    let primaryInstallationId: number | null = null;
    for (const inst of installations) {
      // Enterprise installations have no `login`/`type`; RepoPulse only supports user/org accounts
      const account = inst.account;
      if (!account || !('login' in account)) continue;
      if (account.type !== 'User' && account.type !== 'Organization') continue;

      await supabase.from('github_installations').upsert(
        {
          user_id: user.id,
          installation_id: inst.id,
          app_id: inst.app_id,
          account_login: account.login,
          account_type: account.type,
          access_token: accessToken,
        },
        { onConflict: 'installation_id' },
      );
      if (!primaryInstallationId) primaryInstallationId = inst.id;
    }

    // Create session
    const sessionId = generateSessionId();
    setSession(sessionId, {
      userId: user.id,
      login: ghUser.login,
      accessToken,
      installationId: primaryInstallationId,
    });

    // Redirect to frontend with session cookie
    res.setHeader(
      'Set-Cookie',
      `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    );
    res.redirect(`${env.FRONTEND_URL}/repositories`);
  } catch (err) {
    next(err);
  }
}

export function handleLogout(req: Request, res: Response): void {
  if (req.sessionId) deleteSession(req.sessionId);
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  res.redirect(`${env.FRONTEND_URL}`);
}

export function handleMe(req: Request, res: Response): void {
  const session = req.sessionId ? getSession(req.sessionId) : undefined;
  if (!session) {
    sendError(res, 401, 'UNAUTHORIZED', 'Not authenticated');
    return;
  }
  sendSuccess(res, { login: session.login, installationId: session.installationId });
}
