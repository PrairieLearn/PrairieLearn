import type { Request, Response, NextFunction } from 'express';

export class HttpRedirect {
  public readonly url: string;
  public readonly status: number;

  constructor(url: string, status = 302) {
    this.url = url;
    this.status = status;
  }
}

/**
 * Handles "thrown" redirects. If an instance of `HttpRedirect` is thrown, it
 * will end up here eventually. When we get it, we'll perform the redirect.
 *
 * This is useful as middleware are replaced with functions. Middleware has the
 * very nice property that it can easily short-circuit the request and immediately
 * send a response. This is not natively possible with functions, so we have to
 * abuse the error handling mechanism to achieve the same effect.
 */
export function thrownRedirectMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof HttpRedirect) {
    res.redirect(err.status, err.url);
    return;
  }

  next(err);
}
