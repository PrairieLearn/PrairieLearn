import type { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';

export interface SessionOptions {
  cookie?: {
    name?: string;
  };
}

export function createSessionMiddleware(options: SessionOptions = {}) {
  return function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
    console.log('session middleware');
    console.log(options);
    console.log(req.url);
    console.log(res.headersSent);

    onHeaders(res, () => {
      console.log('headers being sent!');
    });

    next();
  };
}
