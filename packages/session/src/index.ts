import type { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import signature from 'cookie-signature';
import asyncHandler from 'express-async-handler';

import { SessionStore } from './store';
import { beforeEnd } from './before-end';
import { getSessionIdFromCookie, type CookieSecure, shouldSecureCookie } from './cookie';
import { type Session, generateSessionId, loadSession } from './session';

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
  };
}

export function createSessionMiddleware(options: SessionOptions) {
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  const cookieName = options.cookie?.name ?? 'session';
  const store = options.store;

  return asyncHandler(async function sessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const cookieSessionId = getSessionIdFromCookie(req, cookieName, secrets);
    const sessionId = cookieSessionId ?? generateSessionId();
    req.session = await loadSession(sessionId, req, store);

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

      // TODO: only write the cookie if something about the cookie changed, e.g. the expiration date.
      //
      // TODO: implement ability to control which requests get an updated cookie. This will
      // be necessary to ensure cookies are only written for specific domains.
      const isNewSession = !cookieSessionId || cookieSessionId !== req.session.id;
      if (canSetCookie && isNewSession) {
        const signedSessionId = signSessionId(req.session.id, secrets[0]);
        res.cookie(cookieName, signedSessionId, {
          secure: shouldSecureCookie(req, options.cookie?.secure ?? 'auto'),
        });
      }
    });

    beforeEnd(res, next, async () => {
      if (!req.session) {
        // There is no session to do anything with.
        return;
      }

      // TODO: only save it if something actually changed.
      // TODO: implement touching. Does that have to be separate from saving though?
      //
      // TODO: even if `canSetCookie` is false, we should still save the session if
      // it previously existed *and* if it was modified.
      if (req.session && canSetCookie) {
        await store.set(req.session.id, req.session);
      }
    });

    next();
  });
}

function signSessionId(sessionId: string, secret: string): string {
  return signature.sign(sessionId, secret);
}
