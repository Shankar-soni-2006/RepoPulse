import type { Request, Response } from 'express';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'rp_session';
/** Sealed (encrypted) Supabase PKCE state between sign-in start and callback */
export const OAUTH_FLOW_COOKIE = 'rp_oauth_flow';
/** Marks an automatic sign-in restart so a failing exchange can't loop */
export const OAUTH_RETRY_COOKIE = 'rp_oauth_retry';
/** Which login form started sign-in ("admin" only; members have no cookie) */
export const LOGIN_AS_COOKIE = 'rp_login_as';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

interface CookieOptions {
  maxAgeSeconds: number;
  sameSite?: 'lax' | 'strict' | 'none';
}

export function setCookie(res: Response, name: string, value: string, opts: CookieOptions): void {
  const sameSite = opts.sameSite ?? env.SESSION_COOKIE_SAMESITE;
  // Browsers reject SameSite=None without Secure
  const secure = env.NODE_ENV === 'production' || sameSite === 'none';
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${opts.maxAgeSeconds}`,
    `SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`,
  ];
  if (secure) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

export function clearCookie(res: Response, name: string, sameSite?: CookieOptions['sameSite']): void {
  setCookie(res, name, '', { maxAgeSeconds: 0, sameSite });
}
