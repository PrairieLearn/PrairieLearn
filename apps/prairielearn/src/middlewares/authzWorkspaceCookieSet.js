// @ts-check
import asyncHandler from 'express-async-handler';

import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { shouldSecureCookie, setCookie } from '../lib/cookie.js';

export default asyncHandler(async (req, res, next) => {
  // We should only have arrived here if we passed authn/authz and
  // are authorized to access res.locals.workspace_id. We will set a
  // short-lived cookie specific to this workspace_id that will let
  // us bypass authn/authz in the future. This checking is done by
  // middlewares/authzWorkspaceCookieCheck.js

  const workspace_id = res.locals.workspace_id;
  const oldCookieName = `pl_authz_workspace_${workspace_id}`;
  const newCookieName = `pl2_authz_workspace_${workspace_id}`;
  const tokenData = {
    workspace_id: res.locals.workspace_id,
  };
  const cookieData = generateSignedToken(tokenData, config.secretKey);
  setCookie(res, [oldCookieName, newCookieName], cookieData, {
    maxAge: config.workspaceAuthzCookieMaxAgeMilliseconds,
    httpOnly: true,
    secure: shouldSecureCookie(req),
  });
  next();
});
