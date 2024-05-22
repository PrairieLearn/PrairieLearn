// @ts-check
import { clearCookie } from '../lib/cookie.js';

const cookies_to_ignore = [
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
];

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  Object.keys(req.cookies).forEach((key) => {
    if (/^pl2?_/.test(key)) {
      if (cookies_to_ignore.includes(key)) {
        return;
      }
      clearCookie(res, key);
    }
  });
  next();
}
