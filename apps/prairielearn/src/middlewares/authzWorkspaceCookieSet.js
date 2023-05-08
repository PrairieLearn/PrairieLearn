const { generateSignedToken } = require('@prairielearn/signed-token');
const { config } = require('../lib/config');

module.exports = (req, res, next) => {
  // We should only have arrived here if we passed authn/authz and
  // are authorized to access res.locals.workspace_id. We will set a
  // short-lived cookie specific to this workspace_id that will let
  // us bypass authn/authz in the future. This checking is done by
  // middlewares/authzWorkspaceCookieCheck.js

  const workspace_id = res.locals.workspace_id;
  const cookieName = `pl_authz_workspace_${workspace_id}`;
  const tokenData = {
    workspace_id: res.locals.workspace_id,
  };
  const cookieData = generateSignedToken(tokenData, config.secretKey);
  res.cookie(cookieName, cookieData, {
    maxAge: config.workspaceAuthzCookieMaxAgeMilliseconds,
    httpOnly: true,
    secure: true,
  });
  next();
};
