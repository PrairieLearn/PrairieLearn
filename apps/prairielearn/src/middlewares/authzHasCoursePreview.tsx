import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: ['has_course_permission_preview'],
  errorMessage: 'Requires course preview access',
  unauthorizedUsers: 'block',
});
