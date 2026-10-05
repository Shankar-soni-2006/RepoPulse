import type { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/auth/sessionService.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { accessRepository } from '../repositories/accessRepository.js';
import type { Session, User } from '../types/index.js';
import { readCookie, SESSION_COOKIE } from '../utils/cookies.js';
import { runInBackground } from '../utils/background.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

export interface AuthContext {
  session: Session;
  user: User;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** Valid session of a suspended account */
      suspended?: boolean;
    }
  }
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Resolves the session cookie (if any) into req.auth. Never rejects by itself. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return next();

  try {
    const resolved = await sessionService.resolve(token);
    if (resolved?.user.suspendedAt) {
      // Suspension also deletes sessions; this covers any created just before it
      req.suspended = true;
    } else if (resolved) {
      req.auth = resolved;
      // Throttled activity timestamp; failure here must not fail the request
      if (Date.now() - Date.parse(resolved.session.lastSeenAt) > TOUCH_INTERVAL_MS) {
        runInBackground(
          sessionRepository
            .touch(resolved.session.id)
            .catch((err: Error) => console.warn('[auth] failed to touch session:', err.message)),
        );
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.suspended) return next(new UnauthorizedError('This account has been suspended', 'ACCOUNT_SUSPENDED'));
  if (!req.auth) return next(new UnauthorizedError('Sign in to continue'));
  next();
}

/** For admin-only routes. Run after requireAuth. Members get 403. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (getAuth(req).user.role !== 'admin') return next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
  next();
}

export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError('Sign in to continue');
  return req.auth;
}

/** Throws 404 (not 403) so repository existence isn't revealed to users without access. */
export async function assertRepositoryAccess(userId: string, repositoryId: string): Promise<void> {
  if (!(await accessRepository.hasRepositoryAccess(userId, repositoryId))) {
    throw new NotFoundError('Repository');
  }
}

/** For routes with a :repositoryId param. Run after requireAuth and param validation. */
export async function requireRepositoryAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    await assertRepositoryAccess(getAuth(req).user.id, req.params.repositoryId);
    next();
  } catch (err) {
    next(err);
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-repopulse-client';

/**
 * CSRF defence for cookie-authenticated, state-changing requests: browsers can't
 * attach a custom header cross-origin without a CORS preflight, which only
 * FRONTEND_URL passes. HTML forms can't set it at all.
 */
export function requireClientHeader(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER)) return next();
  next(new ForbiddenError(`Missing ${CSRF_HEADER} header`, 'CSRF_HEADER_MISSING'));
}
