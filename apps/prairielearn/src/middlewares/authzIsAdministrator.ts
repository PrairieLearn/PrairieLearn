import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: ['is_administrator'],
  unauthorizedUsers: 'block',
});
