import { Router } from 'express';

import {
  assertNotExampleCourse,
  forbidEffectiveUserOverrides,
  requireLinkedLtiUser,
  requirePlanGrants,
  requireStudentEnrollment,
} from './middleware.js';

/**
 * The student API gives users read-only access to their own data in course
 * instances that they are enrolled in.
 *
 * Rules that apply to every endpoint:
 *
 * - The user is always the one that owns the token (`res.locals.authn_user`).
 *   No endpoint accepts a user ID, and effective user overrides are rejected.
 * - The user must already be enrolled. The API never enrolls anyone.
 * - Access is forbidden in exam mode.
 * - An endpoint returns only what the corresponding student page would show
 *   at that moment. Reuse the queries and helpers that the page uses, and
 *   reuse the middleware that the pages use to load and authorize nested
 *   resources (`selectAndAuthzAssessment`, `selectAndAuthzAssessmentInstance`,
 *   `selectAndAuthzInstanceQuestion`).
 * - Every response is built from an explicit allowlist of fields. Never send
 *   a database row directly.
 */
const router = Router();

router.use([
  // This must come before `authzCourseOrInstance`, which would otherwise act
  // on the override cookies.
  forbidEffectiveUserOverrides,
  // A student could use the API to exfiltrate information from a secure exam,
  // or to look up information during one. We'll forbid API access entirely
  // while in exam mode.
  (await import('../../../middlewares/forbidAccessInExamMode.js')).default,
]);

router.use('/course_instances/:course_instance_id(\\d+)', [
  (await import('../../../middlewares/authzCourseOrInstance.js')).default,
  assertNotExampleCourse,
  requireStudentEnrollment,
  requirePlanGrants,
  requireLinkedLtiUser,
]);

// ROUTES
router.use('/course_instances', (await import('./endpoints/courseInstances/index.js')).default);
router.use(
  '/course_instances/:course_instance_id(\\d+)/gradebook',
  (await import('./endpoints/courseInstanceGradebook/index.js')).default,
);

export default router;
