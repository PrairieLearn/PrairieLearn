import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: ['has_course_permission_preview', 'has_course_instance_permission_view'],
  errorMessage: 'Requires either course preview access or student data view access',
  cosmeticOnly: false,
});
