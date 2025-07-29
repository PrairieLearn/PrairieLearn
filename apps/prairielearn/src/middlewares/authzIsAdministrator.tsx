import { createAuthzMiddleware } from './authzHelper.js';

export default createAuthzMiddleware({
  oneOfPermissions: ['is_administrator'],
  errorMessage: 'Requires administrator privileges',
  cosmeticOnly: false,
});
