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

export function getSessionCookie(req: Request, cookieNames: string[]) {
  const cookies = cookie.parse(req.headers.cookie ?? '');

  // Try each cookie name until we find one that's present.
  let foundCookieName: string | null = null;
  let sessionCookie: string | null = null;
  for (const cookieName of cookieNames) {
    if (cookies[cookieName]) {
      foundCookieName = cookieName;
      sessionCookie = cookies[cookieName];
      break;
    }
  }

  if (!sessionCookie) return null;

  return {
    name: foundCookieName,
    value: sessionCookie,
  };
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
