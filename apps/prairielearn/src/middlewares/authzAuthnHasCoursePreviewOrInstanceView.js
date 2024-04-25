// @ts-check
import { HttpStatusError } from '@prairielearn/error';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  if (
    !res.locals.authz_data.authn_has_course_permission_preview &&
    !res.locals.authz_data.authn_has_course_instance_permission_view
  ) {
    return next(
      new HttpStatusError(403, 'Requires either course preview access or student data view access'),
    );
  }
  next();
}
