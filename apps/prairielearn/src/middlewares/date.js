// @ts-check
import { config } from '../lib/config.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  res.locals.req_date = new Date();
  res.locals.true_req_date = res.locals.req_date;

  // We allow unit tests to override the req_date. Unit tests may also override the user
  // (middlewares/authn.js) and the req_mode (middlewares/authzCourseOrInstance.js).
  if (config.devMode && req.cookies.pl_test_date) {
    res.locals.req_date = new Date(Date.parse(req.cookies.pl_test_date));
  }

  next();
}
