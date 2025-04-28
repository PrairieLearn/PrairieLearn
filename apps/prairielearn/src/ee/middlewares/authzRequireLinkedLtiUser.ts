import { type NextFunction, type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { type Lti13Instance, Lti13InstanceSchema } from '../../lib/db-types.js';

// Load SQL statements from the SQL file
const sql = loadSqlEquiv(import.meta.url);

// Schema for the result of check_user_has_linked_lti_account
const HasLinkedAccountSchema = z.object({
  has_linked_account: z.boolean(),
});

/**
 * Middleware to enforce that a user must have accessed the course through LTI
 * if the LTI instance is configured to require it. This should be run AFTER
 * the basic authorization middleware that confirms the user has access to the course instance.
 */
export default asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Skip this check if the user is an instructor or if the user has no access anyway
  if (
    !res.locals.authz_data.has_student_access_with_enrollment ||
    res.locals.authz_data.has_course_permission_preview ||
    res.locals.authz_data.has_course_instance_permission_view
  ) {
    // Instructors and users without access can proceed without the LTI check
    return next();
  }

  const courseInstanceId = res.locals.course_instance.id;
  const userId = res.locals.authn_user.user_id;

  // Check if there's an LTI instance for this course instance with require_linked_lti_user=true
  const lti13Instance = await queryRow(
    sql.select_lti13_instance_for_course_instance,
    { course_instance_id: courseInstanceId },
    Lti13InstanceSchema,
  );

  // If no LTI instance requires linking, or if the feature is disabled, proceed
  if (!lti13Instance) {
    return next();
  }

  // Check if the user has a linked LTI account for this LTI instance
  const result = await queryRow(
    sql.check_user_has_linked_lti_account,
    {
      user_id: userId,
      lti13_instance_id: lti13Instance.id,
    },
    HasLinkedAccountSchema,
  );

  if (!result.has_linked_account) {
    // Create a message instructing the user to access through the LMS
    const platformName = lti13Instance.name || 'your learning management system';

    // Save the intended URL to redirect back after authentication
    req.session.postLoginRedirect = req.originalUrl;

    // Set locals for the error page controller
    res.locals.platformName = platformName;
    res.locals.message = `You need to access this course through ${platformName} first before you can access it directly in PrairieLearn.`;

    // Redirect to the dedicated error page
    res.redirect('/pl/require_lti_auth');
    return;
  }

  // User has a linked account, proceed with the request
  next();
});
