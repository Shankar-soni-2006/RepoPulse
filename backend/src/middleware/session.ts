import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';

// Simple in-memory session store — replace with Redis/DB sessions in production
// Session: { userId, accessToken, installationId, login }
const sessions = new Map<string, SessionData>();

export interface SessionData {
  userId: string;
  login: string;
  accessToken: string;
  installationId: number | null;
}

export function setSession(sessionId: string, data: SessionData): void {
  sessions.set(sessionId, data);
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}

// Middleware: attach session to request
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionData;
      sessionId?: string;
    }
  }
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const sessionId = req.headers['x-session-id'] as string | undefined
    ?? (req.headers.cookie?.match(/session=([^;]+)/)?.[1]);

  if (sessionId) {
    req.sessionId = sessionId;
    req.session = getSession(sessionId);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session) throw new UnauthorizedError('Authentication required');
  next();
}
