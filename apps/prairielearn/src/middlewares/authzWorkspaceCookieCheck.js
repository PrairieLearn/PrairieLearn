// @ts-check
import asyncHandler from 'express-async-handler';

import { getCheckedSignedTokenData } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { idsEqual } from '../lib/id.js';

export default asyncHandler(async (req, res, next) => {
  // This middleware looks for a workspace_id-specific cookie and,
  // if found, skips the rest of authn/authz. The special cookie is
  // set by middlewares/authzWorkspaceCookieSet.js

  const workspace_id = res.locals.workspace_id;
  const cookieName = `pl2_authz_workspace_${workspace_id}`;
  if (cookieName in req.cookies) {
    // if we have a workspace authz cookie then we try and unpack it
    const cookieData = getCheckedSignedTokenData(req.cookies[cookieName], config.secretKey, {
      maxAge: config.workspaceAuthzCookieMaxAgeMilliseconds,
    });

    // if we have a valid cookie with matching workspace_id then
    // short-circuit the current router to skip the rest of
    // authn/authz
    if (idsEqual(cookieData?.workspace_id, workspace_id)) return next('router');
  }

  // otherwise we fall through and proceed to the full authn/authz stack
  next();
});
