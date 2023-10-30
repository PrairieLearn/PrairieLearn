import type { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import signature from 'cookie-signature';
import asyncHandler from 'express-async-handler';

import { SessionStore } from './store';
import { beforeEnd } from './before-end';
import {
  type CookieSecure,
  shouldSecureCookie,
  getSessionCookie,
  getSessionIdFromCookie,
} from './cookie';
import { type Session, generateSessionId, loadSession, hashSession } from './session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

export interface SessionOptions {
  secret: string | string[];
  store: SessionStore;
  canSetCookie?: (req: Request) => boolean;
  cookie?: {
    /**
     * If multiple names are provided, the first one is used as the primary
     * name for setting the cookie. The other names are used as fallbacks when
     * reading the cookie in requests. If a fallback name is found in a request,
     * the cookie value will be transparently re-written to the primary name.
     */
    name?: string | string[];
    secure?: CookieSecure;
    httpOnly?: boolean;
    domain?: string;
    sameSite?: boolean | 'none' | 'lax' | 'strict';
    maxAge?: number;
  };
}

export { SessionStore };

const DEFAULT_COOKIE_NAME = 'session';
const DEFAULT_COOKIE_MAX_AGE = 86400000; // 1 day

export function createSessionMiddleware(options: SessionOptions) {
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  const cookieNames = getCookieNames(options.cookie?.name);
  const primaryCookieName = cookieNames[0];
  const cookieMaxAge = options.cookie?.maxAge ?? DEFAULT_COOKIE_MAX_AGE;
  const store = options.store;

  return asyncHandler(async function sessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const sessionCookie = getSessionCookie(req, cookieNames);
    const cookieSessionId = getSessionIdFromCookie(sessionCookie?.value, secrets);
    const sessionId = cookieSessionId ?? (await generateSessionId());
    req.session = await loadSession(sessionId, req, store, cookieMaxAge);

    const originalHash = hashSession(req.session);
    const originalExpirationDate = req.session.getExpirationDate();

    const canSetCookie = options.canSetCookie?.(req) ?? true;

    onHeaders(res, () => {
      if (!req.session) {
        if (cookieSessionId) {
          // If the request arrived with a session cookie but the session was
          // destroyed, clear the cookie.
          //
          // To cover all our bases, we'll clear *all* known session cookies to
          // ensure that state sessions aren't left behind.
          cookieNames.forEach((cookieName) => {
            res.clearCookie(cookieName);
          });
          return;
        }

        // There is no session to do anything with.
        return;
      }

      const secureCookie = shouldSecureCookie(req, options.cookie?.secure ?? 'auto');
      if (secureCookie && req.protocol !== 'https') {
        // Avoid sending cookie over insecure connection.
        return;
      }

      const needsRotation = sessionCookie?.name && sessionCookie?.name !== primaryCookieName;
      const isNewSession = !cookieSessionId || cookieSessionId !== req.session.id;
      const didExpirationChange =
        originalExpirationDate.getTime() !== req.session.getExpirationDate().getTime();
      if (canSetCookie && (isNewSession || didExpirationChange || needsRotation)) {
        const signedSessionId = signSessionId(req.session.id, secrets[0]);
        res.cookie(primaryCookieName, signedSessionId, {
          secure: secureCookie,
          httpOnly: options.cookie?.httpOnly ?? true,
          domain: options.cookie?.domain,
          sameSite: options.cookie?.sameSite ?? false,
          expires: req.session.getExpirationDate(),
        });
      }
    });

    beforeEnd(res, next, async () => {
      if (!req.session) {
        // There is no session to do anything with.
        return;
      }

      const isExistingSession = cookieSessionId && cookieSessionId === req.session.id;
      const hashChanged = hashSession(req.session) !== originalHash;
      const didExpirationChange =
        originalExpirationDate.getTime() !== req.session.getExpirationDate().getTime();
      if (
        (hashChanged && isExistingSession) ||
        (canSetCookie && (!isExistingSession || didExpirationChange))
      ) {
        // Only update the expiration date in the store if we were actually
        // able to update the cookie too.
        const expirationDate = canSetCookie
          ? req.session.getExpirationDate()
          : originalExpirationDate;

        await store.set(
          req.session.id,
          req.session,
          // Cookies only support second-level resolution. To ensure consistency
          // between the cookie and the store, truncate the expiration date to
          // the nearest second.
          truncateExpirationDate(expirationDate),
        );
      }
    });

    next();
  });
}

function getCookieNames(cookieName: string | string[] | undefined): string[] {
  if (!cookieName) {
    return [DEFAULT_COOKIE_NAME];
  }

  if (Array.isArray(cookieName) && cookieName.length === 0) {
    throw new Error('cookie.name must not be an empty array');
  }

  return Array.isArray(cookieName) ? cookieName : [cookieName];
}

function signSessionId(sessionId: string, secret: string): string {
  return signature.sign(sessionId, secret);
}

function truncateExpirationDate(date: Date) {
  const time = date.getTime();
  const truncatedTime = Math.floor(time / 1000) * 1000;
  return new Date(truncatedTime);
}
