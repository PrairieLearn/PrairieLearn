import type { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import signature from 'cookie-signature';
import asyncHandler from 'express-async-handler';

import { SessionStore } from './store';
import { beforeEnd } from './before-end';
import { getSessionIdFromCookie, type CookieSecure, shouldSecureCookie } from './cookie';
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
    name?: string;
    secure?: CookieSecure;
    httpOnly?: boolean;
    sameSite?: boolean | 'none' | 'lax' | 'strict';
    maxAge?: number;
  };
}

const DEFAULT_COOKIE_NAME = 'session';
const DEFAULT_COOKIE_MAX_AGE = 86400000; // 1 day

export function createSessionMiddleware(options: SessionOptions) {
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  const cookieName = options.cookie?.name ?? DEFAULT_COOKIE_NAME;
  const cookieMaxAge = options.cookie?.maxAge ?? DEFAULT_COOKIE_MAX_AGE;
  const store = options.store;

  return asyncHandler(async function sessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const cookieSessionId = getSessionIdFromCookie(req, cookieName, secrets);
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
          res.clearCookie(cookieName);
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

      const isNewSession = !cookieSessionId || cookieSessionId !== req.session.id;
      const didExpirationChange =
        originalExpirationDate.getTime() !== req.session.getExpirationDate().getTime();
      if (canSetCookie && (isNewSession || didExpirationChange)) {
        const signedSessionId = signSessionId(req.session.id, secrets[0]);
        res.cookie(cookieName, signedSessionId, {
          secure: secureCookie,
          httpOnly: options.cookie?.httpOnly ?? true,
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

function signSessionId(sessionId: string, secret: string): string {
  return signature.sign(sessionId, secret);
}

function truncateExpirationDate(date: Date) {
  const time = date.getTime();
  const truncatedTime = Math.floor(time / 1000) * 1000;
  return new Date(truncatedTime);
}
