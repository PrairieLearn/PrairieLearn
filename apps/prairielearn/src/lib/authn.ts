import type { Request, Response } from 'express';
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from './config';
import { shouldSecureCookie } from './cookie';
import { InstitutionSchema, UserSchema } from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

interface LoadUserOptions {
  /** Should we send back an authentication cookie? */
  pl_authn_cookie?: boolean;
  /** Should we redirect the user? */
  redirect?: boolean;
}

export interface LoadUserAuth {
  uid?: string;
  uin?: string | null;
  name?: string | null;
  provider?: string;
  /** If this attribute is present, the `users_select_or_insert` call will be skipped. */
  user_id?: number;
  institution_id?: number | string | null;
}

export async function loadUser(
  req: Request,
  res: Response,
  authnParams: LoadUserAuth,
  options: LoadUserOptions = {},
) {
  let user_id = authnParams.user_id;
  if (user_id == null) {
    const params = [
      authnParams.uid,
      authnParams.name,
      authnParams.uin,
      authnParams.provider,
      authnParams.institution_id,
    ];

    const userSelectOrInsertRes = await sqldb.callAsync('users_select_or_insert', params);

    user_id = userSelectOrInsertRes.rows[0].user_id;
    const { result, user_institution_id } = userSelectOrInsertRes.rows[0];
    if (result === 'invalid_authn_provider') {
      res.redirect(`/pl/login?unsupported_provider=true&institution_id=${user_institution_id}`);
      return;
    }
  }

  const selectedUser = await sqldb.queryOptionalRow(
    sql.select_user,
    { user_id },
    z.object({
      user: UserSchema,
      institution: InstitutionSchema,
      is_administrator: z.boolean(),
      is_instructor: z.boolean(),
      news_item_notification_count: z.number(),
    }),
  );

  if (!selectedUser) {
    throw new Error('user not found with user_id ' + user_id);
  }

  // The session store will pick this up and store it in the `user_sessions.user_id` column.
  req.session.user_id = user_id;

  // Our authentication middleware will read this value.
  req.session.authn_provider_name = authnParams.provider;

  if (options.pl_authn_cookie ?? true) {
    const tokenData = {
      user_id,
      authn_provider_name: authnParams.provider || null,
    };
    const pl_authn = generateSignedToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
      secure: shouldSecureCookie(req),
    });

    // After explicitly authenticating, clear the cookie that disables
    // automatic authentication.
    res.clearCookie('pl_disable_auto_authn');
  }

  if (options.redirect ?? false) {
    let redirUrl = res.locals.homeUrl;
    if ('preAuthUrl' in req.cookies) {
      redirUrl = req.cookies.preAuthUrl;
      res.clearCookie('preAuthUrl');
    }
    res.redirect(redirUrl);
    return;
  }

  // If we fall-through here, set the res.locals.authn_user variables (middleware)

  res.locals.authn_user = selectedUser.user;
  res.locals.authn_institution = selectedUser.institution;
  res.locals.authn_provider_name = authnParams.provider;
  res.locals.authn_is_administrator = selectedUser.is_administrator;
  res.locals.authn_is_instructor = selectedUser.is_instructor;

  const defaultAccessType = res.locals.devMode ? 'active' : 'inactive';
  const accessType = req.cookies.pl_access_as_administrator || defaultAccessType;
  res.locals.access_as_administrator = accessType === 'active';
  res.locals.is_administrator =
    res.locals.authn_is_administrator && res.locals.access_as_administrator;

  res.locals.news_item_notification_count = selectedUser.news_item_notification_count;
}
