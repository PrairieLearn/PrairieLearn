// @ts-check
import { HttpStatusError } from '@prairielearn/error';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  if (!res.locals.is_administrator) {
    return next(new HttpStatusError(403, 'Requires administrator privileges'));
  }
  next();
}
