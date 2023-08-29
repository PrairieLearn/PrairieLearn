import type { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';

type CookieSecure = boolean | 'auto' | ((req: Request) => boolean);

export interface SessionOptions {
  cookie?: {
    name?: string;
    secure?: CookieSecure;
  };
}

export function createSessionMiddleware(options: SessionOptions = {}) {
  return function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
    console.log('session middleware');
    console.log(options);
    console.log(req.url);
    console.log(res.headersSent);

    const cookieName = options.cookie?.name ?? 'session';

    onHeaders(res, () => {
      res.cookie(cookieName, 'test', {
        secure: shouldSecureCookie(req, options.cookie?.secure ?? 'auto'),
      });
      console.log('headers being sent!');
    });

    next();
  };
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
