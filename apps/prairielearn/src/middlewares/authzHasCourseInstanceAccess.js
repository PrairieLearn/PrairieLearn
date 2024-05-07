// @ts-check
import { HttpStatusError } from '@prairielearn/error';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  if (
    // Effective user is course instructor.
    res.locals.authz_data.has_course_permission_preview ||
    // Effective user is course instance instructor.
    res.locals.authz_data.has_course_instance_permission_view ||
    // Effective user is enrolled in the course instance.
    res.locals.authz_data.has_student_access_with_enrollment
  ) {
    return next();
  } else {
    return next(new HttpStatusError(403, 'Access denied'));
  }
}
