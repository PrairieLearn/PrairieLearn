import { type NextFunction, type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import { idsEqual } from '../../lib/id.js';
import { selectLti13InstanceIdentitiesForCourseInstance } from '../models/lti13-user.js';

/**
 * Middleware to enforce that a user must have accessed the course through LTI
 * if the LTI instance is configured to require it. This should be run AFTER
 * the basic authorization middleware that confirms the user has access to the course instance.
 */
export default asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // W'll skip the check in two cases:
  // 1. If the user is impersonating another user. This could be a useful
  //    escape hatch for instructors.
  // 2. If the user has any instructor permissions in the course or instance.
  if (
    !idsEqual(res.locals.user.id, res.locals.authn_user.id) ||
    res.locals.authz_data.has_course_permission_preview ||
    res.locals.authz_data.has_course_instance_permission_view
  ) {
    next();
    return;
  }

  const lti13InstanceIdentities = await selectLti13InstanceIdentitiesForCourseInstance({
    course_instance: res.locals.course_instance,
    user: res.locals.authn_user,
  });

  // In most cases, only a single LTI 1.3 instance will be linked to a given course
  // instance, but we still choose to handle the general case of N instances.
  const isMissingIdentities = lti13InstanceIdentities.some(({ lti13_instance, lti13_user_id }) => {
    return lti13_instance.require_linked_lti_user && lti13_user_id == null;
  });

  if (isMissingIdentities) {
    res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/lti_linking_required`);
    return;
  }

  // User has all necessary linked accounts, proceed with the request
  next();
});
