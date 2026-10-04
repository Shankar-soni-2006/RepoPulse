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
  OAUTH_STATE_COOKIE,
  readCookie,
  SESSION_COOKIE,
  setCookie,
} from '../utils/cookies.js';

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(), // e.g. access_denied when the user cancels
});

// The callback is a browser navigation, so failures redirect to the login page
// with a code the frontend can explain, instead of returning JSON.
function redirectToLogin(res: Response, errorCode: string): void {
  res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(errorCode)}`);
}

export function handleGithubLogin(_req: Request, res: Response): void {
  const { url, state } = authService.beginLogin();
  // Lax: must survive the top-level redirect back from github.com
  setCookie(res, OAUTH_STATE_COOKIE, state, { maxAgeSeconds: OAUTH_STATE_TTL_SECONDS, sameSite: 'lax' });
  res.redirect(url);
}

export async function handleGithubCallback(req: Request, res: Response): Promise<void> {
  const expectedState = readCookie(req, OAUTH_STATE_COOKIE);
  clearCookie(res, OAUTH_STATE_COOKIE, 'lax');

  const parsed = callbackQuery.safeParse(req.query);
  if (!parsed.success) return redirectToLogin(res, 'invalid_callback');
  const { code, state, error } = parsed.data;

  if (error) return redirectToLogin(res, error === 'access_denied' ? 'access_denied' : 'github_error');
  if (!code) return redirectToLogin(res, 'invalid_callback');
  if (!expectedState || state !== expectedState) return redirectToLogin(res, 'state_mismatch');

  try {
    const sessionToken = await authService.completeLogin(code);
    setCookie(res, SESSION_COOKIE, sessionToken, { maxAgeSeconds: SESSION_TTL_SECONDS });
    res.redirect(`${env.FRONTEND_URL}/repositories`);
  } catch (err) {
    console.error('[auth] sign-in failed:', err);
    redirectToLogin(res, err instanceof AppError ? err.code.toLowerCase() : 'sign_in_failed');
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
