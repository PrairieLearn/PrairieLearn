import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: ['has_course_permission_own'],
  errorMessage: 'Access denied (must be course owner)',
  cosmeticOnly: false,
});
