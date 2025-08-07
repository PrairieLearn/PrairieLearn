import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: ['has_course_permission_preview'],
  errorMessage: 'Access denied',
  errorExplanation: 'This page requires course preview access.',
  unauthorizedUsers: 'block',
});
