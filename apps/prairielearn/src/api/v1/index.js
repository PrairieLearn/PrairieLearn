// @ts-check
import { Router } from 'express';

import * as error from '@prairielearn/error';
import * as Sentry from '@prairielearn/sentry';

const router = Router();

/**
 * Used to prevent access to student data if the user doesn't have student data
 * viewing permissions. This should be added to any routes that provide student
 * data.
 */
function authzHasCourseInstanceView(req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(new error.HttpStatusError(403, 'Requires student data view access'));
  }
  next();
}

// Pretty-print all JSON responses
router.use(require('./prettyPrintJson').default);

// All course instance pages require authorization
router.use('/course_instances/:course_instance_id(\\d+)', [
  require('../../middlewares/authzCourseOrInstance').default,
  // Asserts that the user has either course preview or course instance student
  // data access. If a route provides access to student data, you should also
  // include the `authzHasCourseInstanceView` middleware to ensure that access
  // to student data is properly limited.
  require('../../middlewares/authzHasCoursePreviewOrInstanceView').default,
  require('./endpoints/courseInstanceInfo').default,
]);

// ROUTES
router.use(
  '/course_instances/:course_instance_id(\\d+)/assessments',
  require('./endpoints/courseInstanceAssessments').default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/assessment_instances',
  authzHasCourseInstanceView,
  require('./endpoints/courseInstanceAssessmentInstances').default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/submissions',
  authzHasCourseInstanceView,
  require('./endpoints/courseInstanceSubmissions').default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/gradebook',
  authzHasCourseInstanceView,
  require('./endpoints/courseInstanceGradebook').default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/course_instance_access_rules',
  require('./endpoints/courseInstanceAccessRules').default,
);

// If no earlier routes matched, 404 the route
router.use(require('./notFound').default);

// The Sentry error handler must come before our own.
router.use(Sentry.Handlers.errorHandler());

// Handle errors independently from the normal PL error handling
router.use(require('./error').default);

export default router;
