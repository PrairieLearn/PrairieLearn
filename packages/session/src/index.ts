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

      const signedSessionId = signSessionId(req.session.id, secrets[0]);
      res.cookie(cookieName, signedSessionId, {
        secure: shouldSecureCookie(req, options.cookie?.secure ?? 'auto'),
      });
    });

    beforeEnd(res, next, async () => {
      // TODO: only save it if something actually changed.
      // TODO: implement touching. Does that have to be separate from saving though?
      if (req.session) {
        await store.set(req.session.id, req.session);
      }
    });

    next();
  });
}

function signSessionId(sessionId: string, secret: string): string {
  return signature.sign(sessionId, secret);
}
