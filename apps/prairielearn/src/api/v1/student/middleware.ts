import { type NextFunction, type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { isEnterprise } from '../../../lib/license.js';

const EFFECTIVE_USER_OVERRIDE_COOKIES = [
  'pl2_requested_uid',
  'pl2_requested_course_role',
  'pl2_requested_course_instance_role',
  'pl2_requested_date',
];

/**
 * The student API always acts as the user that owns the token. Course staff
 * can normally emulate other users, roles, and dates via cookies, which
 * `authzCourseOrInstance` would honor. We reject any such request outright so
 * that the effective user is always the authenticated user.
 *
 * This must run before `authzCourseOrInstance`.
 */
export function forbidEffectiveUserOverrides(req: Request, res: Response, next: NextFunction) {
  if (EFFECTIVE_USER_OVERRIDE_COOKIES.some((name) => req.cookies[name])) {
    throw new HttpStatusError(403, 'Effective user overrides are not supported by the student API');
  }
  next();
}

/**
 * We'll forbid API access to the example course unless the user is a global
 * administrator. This matches the behavior of the instructor API.
 */
export function assertNotExampleCourse(req: Request, res: Response, next: NextFunction) {
  if (res.locals.course.example_course && !res.locals.is_administrator) {
    throw new HttpStatusError(403, 'Access denied');
  }
  next();
}

/**
 * Requires that the authenticated user is already enrolled in the course
 * instance and currently has student access to it.
 *
 * Unlike the student web pages, the API never enrolls anyone: there is
 * deliberately no equivalent of the `autoEnroll` middleware here.
 */
export function requireStudentEnrollment(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.authz_data.authn_has_student_access_with_enrollment) {
    throw new HttpStatusError(403, 'Requires enrollment in the course instance');
  }
  next();
}

/**
 * The student web pages redirect to an upgrade page if the student doesn't
 * have the necessary plan grants. The API denies access instead so that it
 * never exposes anything that the pages wouldn't.
 */
export const requirePlanGrants = asyncHandler(async (req, res, next) => {
  if (isEnterprise()) {
    const { checkPlanGrantsForLocals } = await import('../../../ee/lib/billing/plan-grants.js');
    if (!(await checkPlanGrantsForLocals(res.locals))) {
      throw new HttpStatusError(403, 'Access denied (course instance requires an upgrade)');
    }
  }
  next();
});

/**
 * The student web pages redirect to a linking page if the course instance
 * requires students to have a linked LTI 1.3 account and they don't have one.
 * The API denies access instead.
 */
export const requireLinkedLtiUser = asyncHandler(async (req, res, next) => {
  if (
    isEnterprise() &&
    !res.locals.authz_data.has_course_permission_preview &&
    !res.locals.authz_data.has_course_instance_permission_view
  ) {
    const { selectLti13InstanceIdentitiesForCourseInstance } =
      await import('../../../ee/models/lti13-user.js');
    const identities = await selectLti13InstanceIdentitiesForCourseInstance({
      course_instance: res.locals.course_instance,
      user: res.locals.authn_user,
    });
    const isMissingIdentities = identities.some(
      ({ lti13_instance, lti13_user_id }) =>
        lti13_instance.require_linked_lti_user && lti13_user_id == null,
    );
    if (isMissingIdentities) {
      throw new HttpStatusError(403, 'Access denied (linked LTI account required)');
    }
  }
  next();
});
