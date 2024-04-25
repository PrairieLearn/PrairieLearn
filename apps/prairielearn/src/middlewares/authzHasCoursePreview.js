// @ts-check
import { HttpStatusError } from '@prairielearn/error';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_preview) {
    return next(new HttpStatusError(403, 'Requires course preview access'));
  }
  next();
}
