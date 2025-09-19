import { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { idsEqual } from '../lib/id.js';

const redirects = [
  {
    // try to redirect to the instructor course instance
    canRedirect: (resLocals: Record<string, any>) => {
      return (
        resLocals?.course_instance?.id &&
        (resLocals?.authz_data?.has_course_instance_permission_view ||
          resLocals?.authz_data?.has_course_permission_preview)
      );
    },
    redirect: (resLocals: Record<string, any>) =>
      `${resLocals.plainUrlPrefix}/course_instance/${resLocals.course_instance.id}/instructor`,
  },
  {
    // try to redirect to the instructor course
    canRedirect: (resLocals: Record<string, any>) => {
      return resLocals?.course?.id && resLocals?.authz_data?.has_course_permission_preview;
    },
    redirect: (resLocals: Record<string, any>) =>
      `${resLocals.plainUrlPrefix}/course/${resLocals.course.id}`,
  },
  {
    // try to redirect to the student course instance
    canRedirect: (resLocals: Record<string, any>) => {
      return resLocals?.course_instance?.id && resLocals?.authz_data?.has_student_access;
    },
    redirect: (resLocals: Record<string, any>) =>
      `${resLocals.plainUrlPrefix}/course_instance/${resLocals.course_instance.id}`,
  },
];

/**
 * Returns true if it was redirected. Returns false if we couldn't find a redirect.
 */
export function redirectEffectiveAccessDenied(req: Request, res: Response): boolean {
  // This middleware tries to handle the case where an instructor
  // starts emulating another effective user, but they are currently
  // on a page to which the effective user doesn't have
  // permission. This results in a 403 (Access Denied) error. Here
  // we try and detect this case and redirect to an accessible page.

  // we only redirect if we tried to change emulation data (see middlewares/effectiveRequestChanged.js)
  if (!res.locals.pl_requested_data_changed) return false;

  // skip if we don't have user data
  if (res.locals?.authn_user?.user_id == null) return false;
  if (res.locals?.user?.user_id == null) return false;

  // we are only interested in cases where we are emulating a different user
  if (idsEqual(res.locals.authn_user.user_id, res.locals.user.user_id)) return false;

  // check that we have a plainUrlPrefix
  if (res.locals.plainUrlPrefix == null) return false;

  for (const redirect of redirects) {
    if (redirect.canRedirect(res.locals)) {
      res.redirect(redirect.redirect(res.locals));
      return true;
    }
  }

  // give up, we couldn't figure out a useful redirect
  return false;
}

/**
 * This error handler is used to redirect to an accessible page if the user
 * is not authorized to access the page.
 */
export const redirectEffectiveAccessDeniedErrorHandler: ErrorRequestHandler = (
  err,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err.status !== 403) {
    return next(err);
  }

  const redirected = redirectEffectiveAccessDenied(req, res);
  if (redirected) {
    return;
  }
  next(err);
};
