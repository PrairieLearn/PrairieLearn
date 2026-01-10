// @ts-check
import assert from 'node:assert';

import type { Request, Response } from 'express';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { redirectToTermsPageIfNeeded } from '../ee/lib/terms.js';
import { clearCookie } from '../lib/cookie.js';

import { type LoadUserAuth, SelectUserSchema } from './authn.types.js';
import { config } from './config.js';
import { SprocUsersSelectOrInsertSchema, type User } from './db-types.js';
import { isEnterprise } from './license.js';
import { HttpRedirect } from './redirect.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function handlePendingLti13User({
  user,
  uin,
  sub,
  lti13_instance_id,
}: {
  user: User;
  uin: string;
  sub: string;
  lti13_instance_id: string;
}) {
  // This function will only be called in enterprise mode. We use dynamic
  // imports to avoid loading enterprise code in non-enterprise installations.
  const { updateLti13UserSub } = await import('../ee/models/lti13-user.js');
  const { selectLti13Instance } = await import('../ee/models/lti13Instance.js');

  // This will error if the LTI 1.3 instance doesn't exist.
  const lti13Instance = await selectLti13Instance(lti13_instance_id);

  if (user.uin !== uin) {
    throw new Error(`UIN from LTI (${uin}) does not match user UIN (${user.uin})`);
  }

  if (lti13Instance.institution_id !== user.institution_id) {
    throw new Error(
      `Institution ID from LTI (${lti13Instance.institution_id}) does not match user institution ID (${user.institution_id})`,
    );
  }

  // Store the `sub` claim.
  await updateLti13UserSub({
    user_id: user.id,
    lti13_instance_id: lti13Instance.id,
    sub,
  });
}

interface LoadUserOptions {
  /** Redirect after processing? */
  redirect?: boolean;
}

export async function loadUser(
  req: Request,
  res: Response,
  authnParams: LoadUserAuth,
  optionsParams: LoadUserOptions = {},
): Promise<{ user: User }> {
  const options = { redirect: false, ...optionsParams };

  const lti13_pending_uin = req.session.lti13_pending_uin;
  const lti13_pending_sub = req.session.lti13_pending_sub;
  const lti13_pending_instance_id = req.session.lti13_pending_instance_id;

  // Immediately clear these values from the session. They're only used once,
  // and on the unlikely chance that they contain bad data, we want to
  // aggressively clear them so they don't interfere with future logins.
  req.session.lti13_pending_uin = undefined;
  req.session.lti13_pending_sub = undefined;
  req.session.lti13_pending_instance_id = undefined;

  let user_id: number | string;
  if (authnParams.user_id !== undefined) {
    user_id = authnParams.user_id;
  } else {
    const params = [
      authnParams.uid,
      authnParams.name,
      authnParams.uin,
      authnParams.email,
      authnParams.provider,
      authnParams.institution_id,
    ];

    const userSelectOrInsertRes = await sqldb.callRow(
      'users_select_or_insert',
      params,
      SprocUsersSelectOrInsertSchema,
    );

    const { result, user_institution_id } = userSelectOrInsertRes;
    if (result === 'invalid_authn_provider') {
      assert(user_institution_id !== null);
      throw new HttpRedirect(
        `/pl/login?unsupported_provider=true&institution_id=${user_institution_id}`,
      );
    }

    assert(userSelectOrInsertRes.user_id !== null);
    user_id = userSelectOrInsertRes.user_id;
  }

  const selectedUser = await sqldb.queryOptionalRow(sql.select_user, { user_id }, SelectUserSchema);

  if (!selectedUser) {
    throw new Error('user not found with user_id ' + user_id);
  }

  // If the student is authing as part of an LTI 1.3 launch, we need to associate
  // the pending `sub` claim with the user. We'll take care to ensure that the
  // UIN and institution ID match.
  if (isEnterprise() && lti13_pending_uin && lti13_pending_sub && lti13_pending_instance_id) {
    await handlePendingLti13User({
      user: selectedUser.user,
      uin: lti13_pending_uin,
      sub: lti13_pending_sub,
      lti13_instance_id: lti13_pending_instance_id,
    });
  }

  // The session store will pick this up and store it in the `user_sessions.user_id` column.
  req.session.user_id = user_id;

  // Our authentication middleware will read this value.
  req.session.authn_provider_name = authnParams.provider;

  // After explicitly authenticating, clear the cookie that disables
  // automatic authentication.
  if (req.cookies.pl_disable_auto_authn || req.cookies.pl2_disable_auto_authn) {
    clearCookie(res, ['pl_disable_auto_authn', 'pl2_disable_auto_authn']);
  }

  if (options.redirect) {
    let redirUrl = '/';
    if ('pl2_pre_auth_url' in req.cookies) {
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
      (await sqldb.queryRow(
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
