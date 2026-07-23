import type { Request, Response } from 'express';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { redirectToTermsPageIfNeeded } from '../ee/lib/terms.js';
import { clearCookie } from '../lib/cookie.js';

import { selectOrInsertUserId } from './authn-user.js';
import { type LoadUserAuth, SelectUserSchema } from './authn.types.js';
import { config } from './config.js';
import { type User } from './db-types.js';
import { isEnterprise } from './license.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface LoadUserOptions {
  /** Redirect after processing? */
  redirect?: boolean;
  /** Override the post-auth redirect target. Only used when `redirect` is true. */
  redirectUrl?: string;
  /**
   * Whether the user authenticated from within LockDown Browser. Only the
   * PrairieTest auth flow sets this; it is persisted on the session so
   * downstream enforcement can require LDB for LDB-only reservations.
   */
  lockdownBrowser?: boolean;
  /**
   * Preserve any existing LockDown Browser state. This should only be used by
   * authentication middleware that is reloading the current session.
   */
  preserveLockdownBrowser?: boolean;
}

export async function loadUser(
  req: Request,
  res: Response,
  authnParams: LoadUserAuth,
  optionsParams: LoadUserOptions = {},
): Promise<{ user: User }> {
  const options = { redirect: false, ...optionsParams };

  let user_id: number | string;
  let consumedPendingLti13Auth = false;
  // Recognize the old split keys only to consume and reject them. They lack an
  // expiration, so an in-flight session from an older server must fail closed.
  const hasPendingLti13Auth = [
    'pending_lti13_auth',
    'lti13_pending_uin',
    'lti13_pending_sub',
    'lti13_pending_instance_id',
  ].some((key) => Object.hasOwn(req.session, key));
  if (isEnterprise() && hasPendingLti13Auth) {
    // These imports must remain dynamic so non-enterprise installations do not load
    // enterprise-only code.
    const { authenticatePendingLti13User, consumePendingLti13Auth } =
      await import('../ee/auth/lti13/lti13AuthUser.js');
    try {
      const pendingLti13Auth = consumePendingLti13Auth(req.session);
      consumedPendingLti13Auth = true;
      user_id = await authenticatePendingLti13User({ authnParams, pendingLti13Auth });
    } catch (error) {
      delete req.session.lti13_claims;
      delete req.session.authn_lti13_instance_id;
      clearCookie(res, ['preAuthUrl', 'pl2_pre_auth_url']);
      throw error;
    }
  } else if (authnParams.user_id !== undefined) {
    user_id = authnParams.user_id;
  } else {
    user_id = await selectOrInsertUserId(authnParams);
  }

  const selectedUser = await sqldb.queryOptionalRow(sql.select_user, { user_id }, SelectUserSchema);

  if (!selectedUser) {
    throw new Error('user not found with user_id ' + user_id);
  }

  // Regenerate the session on any identity transition to prevent session
  // fixation. Also regenerate when elevating an existing session into a
  // LockDown Browser session, since that flag grants stronger exam access.
  // The authn middleware re-enters this function on every request with the
  // existing session's user_id, so the guard keeps it a no-op there.
  const lockdownBrowserElevation =
    options.lockdownBrowser === true && req.session.lockdown_browser !== true;
  if (req.session.user_id !== user_id || lockdownBrowserElevation) {
    // The LTI 1.3 launch flow stores `lti13_claims` and `authn_lti13_instance_id`
    // in the session before authentication completes and consumes them afterward.
    // These must be carried forward across this session regeneration.

    const inLti13Launch = authnParams.provider === 'LTI 1.3' || consumedPendingLti13Auth;

    const preservedSessionData = inLti13Launch
      ? ['lti13_claims', 'authn_lti13_instance_id']
          .map((key) => [key, req.session[key]] as const)
          .filter(([_, v]) => v !== undefined)
      : [];

    await req.session.regenerate();

    for (const [key, value] of preservedSessionData) {
      req.session[key] = value;
    }
  }

  // The session store will pick this up and store it in the `user_sessions.user_id` column.
  req.session.user_id = user_id;

  // Our authentication middleware will read this value.
  req.session.authn_provider_name = authnParams.provider;

  req.session.lockdown_browser =
    options.lockdownBrowser ??
    (options.preserveLockdownBrowser ? req.session.lockdown_browser : false);

  // After explicitly authenticating, clear the cookie that disables
  // automatic authentication.
  if (req.cookies.pl_disable_auto_authn || req.cookies.pl2_disable_auto_authn) {
    clearCookie(res, ['pl_disable_auto_authn', 'pl2_disable_auto_authn']);
  }

  if (options.redirect) {
    let redirUrl = '/';
    if (options.redirectUrl !== undefined) {
      redirUrl = options.redirectUrl;
      // Clear cookies here as well so it doesn't affect a later login redirect
      clearCookie(res, ['preAuthUrl', 'pl2_pre_auth_url']);
    } else if ('pl2_pre_auth_url' in req.cookies) {
      redirUrl = req.cookies.pl2_pre_auth_url;
      clearCookie(res, ['preAuthUrl', 'pl2_pre_auth_url']);
    }

    // Potentially prompt the user to accept the terms before redirecting them.
    if (isEnterprise()) {
      await redirectToTermsPageIfNeeded(res, selectedUser.user, req.ip, redirUrl);
    }

    res.redirect(redirUrl);
  } else {
    // We're being run as middleware. Set `res.locals` values.

    res.locals.authn_user = selectedUser.user;
    res.locals.authn_institution = selectedUser.institution;
    res.locals.authn_provider_name = authnParams.provider;
    res.locals.authn_is_administrator = selectedUser.is_administrator;

    const defaultAccessType = config.devMode ? 'active' : 'inactive';
    const accessType = req.cookies.pl2_access_as_administrator || defaultAccessType;
    res.locals.access_as_administrator = accessType === 'active';
    res.locals.is_administrator =
      res.locals.authn_is_administrator && res.locals.access_as_administrator;

    res.locals.is_institution_administrator =
      res.locals.is_administrator ||
      (await sqldb.queryScalar(
        sql.select_is_institution_admin,
        {
          institution_id: res.locals.authn_institution.id,
          user_id: res.locals.authn_user.id,
        },
        z.boolean(),
      ));
  }

  return { user: selectedUser.user };
}
