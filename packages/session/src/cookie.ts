import cookie from 'cookie';
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
  req: Request,
  cookieName: string,
  secrets: string[],
): string | null {
  const cookies = cookie.parse(req.headers.cookie ?? '');
  const sessionCookie = cookies[cookieName];

  if (!sessionCookie) return null;

  // Try each secret until we find one that works.
  for (const secret of secrets) {
    const value = signature.unsign(sessionCookie, secret);
    if (value !== false) {
      return value;
    }
  }

  return null;
}
