import signature from 'cookie-signature';
import type { Request } from 'express';

export type CookieSecure = boolean | 'auto' | ((req: Request) => boolean);

export function shouldSecureCookie(req: Request, secure: CookieSecure): boolean {
  if (typeof secure === 'function') {
    return secure(req);
  }

  if (secure === 'auto') {
    return req.protocol === 'https';
  }

  return secure;
}

export function getSessionIdFromCookie(
  sessionCookie: string | null | undefined,
  secrets: string[],
) {
  // Try each secret until we find one that works.
  if (sessionCookie) {
    for (const secret of secrets) {
      const value = signature.unsign(sessionCookie, secret);
      if (value !== false) {
        return value;
      }
    }
  }

  return null;
}
