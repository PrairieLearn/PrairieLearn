const express = require('express');

const error = require('@prairielearn/error');
const Sentry = require('@prairielearn/sentry');

const router = express.Router();

/**
 * Used to prevent access to student data if the user doesn't have student data
 * viewing permissions. This should be added to any routes that provide student
 * data.
 */
function authzHasCourseInstanceView(req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Requires student data view access'));
  }
  next();
}

// Pretty-print all JSON responses
router.use(require('./prettyPrintJson'));

// All course instance pages require authorization
router.use('/course_instances/:course_instance_id', [
  require('../../middlewares/authzCourseOrInstance'),
  // Asserts that the user has either course preview or course instance student
  // data access. If a route provides access to student data, you should also
  // include the `authzHasCourseInstanceView` middleware to ensure that access
  // to student data is properly limited.
  require('../../middlewares/authzHasCoursePreviewOrInstanceView'),
  require('./endpoints/courseInstanceInfo'),
]);

// ROUTES
router.use(
  '/course_instances/:course_instance_id/assessments',
  require('./endpoints/courseInstanceAssessments'),
);
router.use(
  '/course_instances/:course_instance_id/assessment_instances',
  authzHasCourseInstanceView,
  require('./endpoints/courseInstanceAssessmentInstances'),
);
router.use(
  '/course_instances/:course_instance_id/submissions',
  authzHasCourseInstanceView,
  require('./endpoints/courseInstanceSubmissions'),
);
router.use(
  '/course_instances/:course_instance_id/gradebook',
  authzHasCourseInstanceView,
  require('./endpoints/courseInstanceGradebook'),
);
router.use(
  '/course_instances/:course_instance_id/course_instance_access_rules',
  require('./endpoints/courseInstanceAccessRules'),
);

// If no earlier routes matched, 404 the route
router.use(require('./notFound'));

// The Sentry error handler must come before our own.
router.use(Sentry.Handlers.errorHandler());

// Handle errors independently from the normal PL error handling
router.use(require('./error'));

module.exports = router;
