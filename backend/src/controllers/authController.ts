import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authService } from '../services/auth/authService.js';
import { sessionService, SESSION_TTL_SECONDS } from '../services/auth/sessionService.js';
import { getAuth } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import {
  clearCookie,
  LOGIN_AS_COOKIE,
  OAUTH_FLOW_COOKIE,
  OAUTH_RETRY_COOKIE,
  readCookie,
  SESSION_COOKIE,
  setCookie,
} from '../utils/cookies.js';

const OAUTH_FLOW_TTL_SECONDS = 10 * 60;
const OAUTH_RETRY_TTL_SECONDS = 60;

const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  // Errors from GitHub or Supabase, e.g. access_denied when the user cancels
  error: z.string().optional(),
  error_code: z.string().optional(),
  error_description: z.string().optional(),
});

// The callback is a browser navigation, so failures redirect to the login page
// with a code the frontend can explain, instead of returning JSON.
function redirectToLogin(res: Response, errorCode: string, asAdmin = false): void {
  res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(errorCode)}${asAdmin ? '&as=admin' : ''}`);
}

// Where a successful sign-in lands: the admin form goes to the Admin page
const landingUrl = (asAdmin: boolean) => `${env.FRONTEND_URL}${asAdmin ? '/admin' : '/repositories'}`;

export async function handleGithubLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url, flow } = await authService.beginLogin();
    // The admin login form (?as=admin) only lets admins in; the role is checked at the callback
    if (req.query.as === 'admin') {
      setCookie(res, LOGIN_AS_COOKIE, 'admin', { maxAgeSeconds: OAUTH_FLOW_TTL_SECONDS, sameSite: 'lax' });
    } else {
      clearCookie(res, LOGIN_AS_COOKIE, 'lax');
    }
    // Lax: must survive the top-level redirect back from Supabase/GitHub. The PKCE
    // verifier inside also binds the callback to this browser (CSRF protection).
    setCookie(res, OAUTH_FLOW_COOKIE, flow, { maxAgeSeconds: OAUTH_FLOW_TTL_SECONDS, sameSite: 'lax' });
    res.redirect(url);
  } catch (err) {
    console.error('[auth] could not start sign-in:', err);
    if (!res.headersSent) redirectToLogin(res, 'sign_in_failed');
    else next(err);
  }
}

export async function handleGithubCallback(req: Request, res: Response): Promise<void> {
  const flow = readCookie(req, OAUTH_FLOW_COOKIE);
  const asAdmin = readCookie(req, LOGIN_AS_COOKIE) === 'admin';
  clearCookie(res, OAUTH_FLOW_COOKIE, 'lax');
  clearCookie(res, LOGIN_AS_COOKIE, 'lax');

  const parsed = callbackQuery.safeParse(req.query);
  if (!parsed.success) return redirectToLogin(res, 'invalid_callback', asAdmin);
  const { code, error, error_code, error_description } = parsed.data;

  if (error) {
    if (error !== 'access_denied') console.warn(`[auth] sign-in error from provider: ${error} ${error_code ?? ''} ${error_description ?? ''}`);
    return redirectToLogin(res, error === 'access_denied' ? 'access_denied' : 'github_error', asAdmin);
  }
  if (!code) return redirectToLogin(res, 'invalid_callback', asAdmin);
  if (!flow) return redirectToLogin(res, 'state_mismatch', asAdmin);

  try {
    const sessionToken = await authService.completeLogin(code, flow, { requireAdmin: asAdmin });
    setCookie(res, SESSION_COOKIE, sessionToken, { maxAgeSeconds: SESSION_TTL_SECONDS });
    clearCookie(res, OAUTH_RETRY_COOKIE, 'lax');
    res.redirect(landingUrl(asAdmin));
  } catch (err) {
    if (err instanceof AppError && err.code === 'OAUTH_CODE_INVALID') {
      // A duplicate callback request: the first one may already have signed the user in
      if (req.auth) return void res.redirect(landingUrl(asAdmin && req.auth.user.role === 'admin'));
      // Otherwise start over once; GitHub returns a fresh code without asking again
      if (!readCookie(req, OAUTH_RETRY_COOKIE)) {
        console.warn('[auth] sign-in code already used or expired; restarting sign-in');
        setCookie(res, OAUTH_RETRY_COOKIE, '1', { maxAgeSeconds: OAUTH_RETRY_TTL_SECONDS, sameSite: 'lax' });
        return void res.redirect(`${env.BACKEND_URL}/api/auth/github${asAdmin ? '?as=admin' : ''}`);
      }
    }
    console.error('[auth] sign-in failed:', err);
    clearCookie(res, OAUTH_RETRY_COOKIE, 'lax');
    redirectToLogin(res, err instanceof AppError ? err.code.toLowerCase() : 'sign_in_failed', asAdmin);
  }
}

export async function handleLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.auth) await sessionService.destroy(req.auth.session.id);
    clearCookie(res, SESSION_COOKIE);
    sendSuccess(res, { signedOut: true });
  } catch (err) {
    next(err);
  }
}

export async function handleMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await authService.getSessionInfo(getAuth(req).user));
  } catch (err) {
    next(err);
  }
}
