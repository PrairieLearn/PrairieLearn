import cookie from 'cookie';
import signature from 'cookie-signature';
import type { Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import onHeaders from 'on-headers';

import { beforeEnd } from './before-end.js';
import { type CookieSecure, shouldSecureCookie, getSessionIdFromCookie } from './cookie.js';
import {
  type Session,
  generateSessionId,
  loadSession,
  hashSession,
  truncateExpirationDate,
} from './session.js';
import { type SessionStore } from './store.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

interface CookieOptions {
  secure?: CookieSecure;
  httpOnly?: boolean;
  domain?: string;
  sameSite?: boolean | 'none' | 'lax' | 'strict';
  maxAge?: number;
}

export interface SessionOptions {
  secret: string | string[];
  store: SessionStore;
  cookie?: CookieOptions & {
    /**
     * The name of the session cookie. The session is always read from this
     * named cookie, but it may be written to multiple cookies if `writeNames`
     * is provided.
     */
    name?: string;
    /**
     * Multiple write names can be provided to allow for a session cookie to be
     * written to multiple names. This can be useful for a migration of a cookie
     * to an explicit subdomain, for example.
     */
    writeNames?: string[];
    /**
     * Used with `writeNames` to provide additional options for each written cookie.
     */
    writeOverrides?: Omit<CookieOptions, 'secure'>[];
  };
}

export { SessionStore };

const DEFAULT_COOKIE_NAME = 'session';
const DEFAULT_COOKIE_MAX_AGE = 86400000; // 1 day

export function createSessionMiddleware(options: SessionOptions) {
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  const cookieName = options.cookie?.name ?? DEFAULT_COOKIE_NAME;
  const cookieMaxAge = options.cookie?.maxAge ?? DEFAULT_COOKIE_MAX_AGE;
  const store = options.store;

  // Ensure that the session cookie that we're reading from will be written to.
  const writeCookieNames = options.cookie?.writeNames ?? [cookieName];
  if (!writeCookieNames.includes(cookieName)) {
    throw new Error('cookie.name must be included in cookie.writeNames');
  }

  // Validate write overrides.
  if (options.cookie?.writeOverrides && !options.cookie.writeNames) {
    throw new Error('cookie.writeOverrides must be used with cookie.writeNames');
  }
  if (
    options.cookie?.writeOverrides &&
    options.cookie.writeOverrides.length !== writeCookieNames.length
  ) {
    throw new Error('cookie.writeOverrides must have the same length as cookie.writeNames');
  }

  return asyncHandler(async function sessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const cookies = cookie.parse(req.headers.cookie ?? '');
    const sessionCookie = cookies[cookieName];
    const cookieSessionId = getSessionIdFromCookie(sessionCookie, secrets);
    const sessionId = cookieSessionId ?? (await generateSessionId());
    req.session = await loadSession(sessionId, req, store, cookieMaxAge);

    const originalHash = hashSession(req.session);
    const originalExpirationDate = req.session.getExpirationDate();

    onHeaders(res, () => {
      if (!req.session) {
        if (cookieSessionId) {
          // If the request arrived with a session cookie but the session was
          // destroyed, clear the cookie.
          //
          // To cover all our bases, we'll clear *all* known session cookies to
          // ensure that state sessions aren't left behind. We'll also send commands
          // to clear the cookies both on and off the explicit domain, to handle
          // the case where the application has moved from one domain to another.
          writeCookieNames.forEach((cookieName, i) => {
            res.clearCookie(cookieName);
            const domain = options.cookie?.writeOverrides?.[i]?.domain ?? options.cookie?.domain;
            if (domain) {
              res.clearCookie(cookieName, { domain: options.cookie?.domain });
            }
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

      // Ensure that all known session cookies are set to the same value.
      const hasAllCookies = writeCookieNames.every((cookieName) => !!cookies[cookieName]);
      const isNewSession = !cookieSessionId || cookieSessionId !== req.session.id;
      const didExpirationChange =
        originalExpirationDate.getTime() !== req.session.getExpirationDate().getTime();
      if (isNewSession || didExpirationChange || !hasAllCookies) {
        const signedSessionId = signSessionId(req.session.id, secrets[0]);
        writeCookieNames.forEach((cookieName, i) => {
          res.cookie(cookieName, signedSessionId, {
            secure: secureCookie,
            httpOnly: options.cookie?.httpOnly ?? true,
            domain: options.cookie?.domain,
            sameSite: options.cookie?.sameSite ?? false,
            expires: req.session.getExpirationDate(),
            ...(options.cookie?.writeOverrides?.[i] ?? {}),
          });
        });
      }
    });

    let sessionPersisted = false;

    async function persistSession(req: Request) {
      if (!req.session || sessionPersisted) {
        // There is no session to do anything with.
        return;
      }

      sessionPersisted = true;

      // If this is a new session, we would have already persisted it to the
      // store, so we don't need to take that into consideration here.
      //
      // If the hash of the session data changed, we'll unconditionally persist
      // the updated data to the store. However, if the hash didn't change, we
      // only want to persist it if the expiration changed *and* if we can set
      // a cookie to reflect the updated expiration date.
      const hashChanged = hashSession(req.session) !== originalHash;
      const expirationChanged =
        originalExpirationDate.getTime() !== req.session.getExpirationDate().getTime();
      if (hashChanged || expirationChanged) {
        await store.set(
          req.session.id,
          req.session,
          // Cookies only support second-level resolution. To ensure consistency
          // between the cookie and the store, truncate the expiration date to
          // the nearest second.
          truncateExpirationDate(req.session.getExpirationDate()),
        );
      }
    }

    // We'll attempt to persist the session at the end of the request. This
    // hacky strategy is borrowed from `express-session`.
    beforeEnd(res, next, async () => {
      await persistSession(req);
    });

    // We'll also attempt to persist the session before performing a redirect.
    // This is necessary because browsers and `fetch()` implementations aren't
    // required to wait for a response body to be received before following a
    // redirect. So, we need to make sure that the session is persisted before
    // we send the redirect response. This way, the subsequent GET will be able
    // to load the latest session data.
    const originalRedirect = res.redirect as any;
    res.redirect = function redirect(...args: any[]) {
      persistSession(req).then(
        () => originalRedirect.apply(res, args),
        (err) => next(err),
      );
    };

    next();
  });
}

function signSessionId(sessionId: string, secret: string): string {
  return signature.sign(sessionId, secret);
}
