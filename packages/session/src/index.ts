import type { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import cookie from 'cookie';
import signature from 'cookie-signature';
import { sync as uidSync } from 'uid-safe';
import asyncHandler from 'express-async-handler';

import { SessionStore } from './store';
import { beforeEnd } from './before-end';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // TODO: more precise type
      session: any;
    }
  }
}

type CookieSecure = boolean | 'auto' | ((req: Request) => boolean);

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
    req.session = {};

    const sessionId = getSessionIdFromCookie(req, cookieName, secrets) ?? uidSync(24);
    console.log('sessionId', sessionId);
    req.session = (await store.get(sessionId)) ?? {};

    onHeaders(res, () => {
      console.log('headers sessionId', sessionId);
      const signedSessionId = signSessionId(sessionId, secrets[0]);
      console.log('signedSessionId', signedSessionId);
      res.cookie(cookieName, signedSessionId, {
        secure: shouldSecureCookie(req, options.cookie?.secure ?? 'auto'),
      });
    });

    beforeEnd(res, next, async () => {
      await store.set(sessionId, req.session);
    });

    next();
  });
}

function shouldSecureCookie(req: Request, secure: CookieSecure): boolean {
  if (typeof secure === 'function') {
    return secure(req);
  }

  if (secure === 'auto') {
    return req.protocol === 'https';
  }

  return secure;
}

function getSessionIdFromCookie(
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

function signSessionId(sessionId: string, secret: string): string {
  return signature.sign(sessionId, secret);
}
