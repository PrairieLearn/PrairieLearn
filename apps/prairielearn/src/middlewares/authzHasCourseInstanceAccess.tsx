import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: [
    // Effective user is course instructor.
    'has_course_permission_preview',
    // Effective user is course instance instructor.
    'has_course_instance_permission_view',
    // Effective user is enrolled in the course instance.
    'has_student_access_with_enrollment',
  ],
  errorExplanation: 'This page requires course instance access.',
  unauthorizedUsers: 'block',
});
