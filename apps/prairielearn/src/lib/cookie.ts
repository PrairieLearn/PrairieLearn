import type { Request, Response, CookieOptions } from 'express';

import { config } from './config.js';

export function shouldSecureCookie(req: Request): boolean {
  // In production, always set secure: true. Otherwise, only set it to true if
  // the request is made over HTTPS.
  //
  // `req.protocol` should reflect Express' `trust proxy` setting, which should
  // be used when the app is behind a reverse proxy or load balancer.
  return !config.devMode || req.protocol === 'https';
}

type OldAndNewCookieNames = [string, string];

/**
 * Helper function to clear a cookie regardless of if it was set with an
 * explicit domain or not.
 */
export function clearCookie(res: Response, name: string | OldAndNewCookieNames): void {
  const names = Array.isArray(name) ? name : [name];
  for (const name of names) {
    res.clearCookie(name);
    res.clearCookie(name, { domain: config.cookieDomain ?? undefined });
  }
}

/**
 * Helper function to set both "old" and "new" cookies. The "old" cookie is
 * typically something like `pl_foo`, and the "new" cookie is `pl2_foo`. Old
 * cookies do not have an explicit domain, while new cookies do.
 */
export function setCookie(
  res: Response,
  names: OldAndNewCookieNames,
  value: string,
  options: Omit<CookieOptions, 'domain'> = {},
) {
  res.cookie(names[0], value, options);
  res.cookie(names[1], value, {
    domain: config.cookieDomain ?? undefined,
    ...options,
  });
}
