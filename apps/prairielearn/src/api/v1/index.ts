import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as Sentry from '@prairielearn/sentry';

const router = Router();

/**
 * Used to prevent access to student data if the user doesn't have student data
 * viewing permissions. This should be added to any routes that provide student
 * data.
 */
const authzHasCourseInstanceView = asyncHandler(async (req, res, next) => {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    throw new error.HttpStatusError(403, 'Requires student data view access');
  }
  next();
});

// Pretty-print all JSON responses
router.use((await import('./prettyPrintJson.js')).default);

// All course instance pages require authorization
router.use('/course_instances/:course_instance_id(\\d+)', [
  (await import('../../middlewares/authzCourseOrInstance.js')).default,
  // Asserts that the user has either course preview or course instance student
  // data access. If a route provides access to student data, you should also
  // include the `authzHasCourseInstanceView` middleware to ensure that access
  // to student data is properly limited.
  (await import('../../middlewares/authzHasCoursePreviewOrInstanceView.js')).default,
  (await import('./endpoints/courseInstanceInfo/index.js')).default,
]);

// ROUTES
router.use(
  '/course_instances/:course_instance_id(\\d+)/assessments',
  (await import('./endpoints/courseInstanceAssessments/index.js')).default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/assessment_instances',
  authzHasCourseInstanceView,
  (await import('./endpoints/courseInstanceAssessmentInstances/index.js')).default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/submissions',
  authzHasCourseInstanceView,
  (await import('./endpoints/courseInstanceSubmissions/index.js')).default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/gradebook',
  authzHasCourseInstanceView,
  (await import('./endpoints/courseInstanceGradebook/index.js')).default,
);
router.use(
  '/course_instances/:course_instance_id(\\d+)/course_instance_access_rules',
  (await import('./endpoints/courseInstanceAccessRules/index.js')).default,
);

// If no earlier routes matched, 404 the route
router.use((await import('./notFound.js')).default);

// The Sentry error handler must come before our own.
router.use(Sentry.expressErrorHandler());

// Handle errors independently from the normal PL error handling
router.use((await import('./error.js')).default);

export default router;
