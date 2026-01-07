import { type NextFunction, type Request, type Response } from 'express';

import { clearCookie } from '../lib/cookie.js';

const cookies_to_ignore = new Set([
  'pl_authn',
  'pl2_authn',
  'pl_assessmentpw',
  'pl2_assessmentpw',
  'pl_access_as_administrator',
  'pl2_access_as_administrator',
  'pl_disable_auto_authn',
  'pl2_disable_auto_authn',
  'prairielearn_session',
  'pl2_session',
]);

export default function (req: Request, res: Response, next: NextFunction) {
  Object.keys(req.cookies).forEach((key) => {
    if (/^pl2?_/.test(key)) {
      if (cookies_to_ignore.has(key)) {
        return;
      }
      clearCookie(res, key);
    }
  });
  next();
}
