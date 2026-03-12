import type { Request, Response } from 'express';

import { callScalar } from '@prairielearn/postgres';

import { config } from './config.js';
import { type EnumMode, EnumModeSchema } from './db-types.js';

export async function getModeForRequest(req: Request, res: Response): Promise<EnumMode> {
  // If we're lucky, `authzCourseOrInstance` has already populated the mode.
  if (res.locals.authz_data?.mode) {
    return res.locals.authz_data.mode;
  }

  // This function can be run independently of `authzCourseOrInstance`, which is
  // normally responsible for handling the `pl_test_mode` cookie. We'll
  // duplicate that logic here so that it works in all contexts.
  if (config.devMode && req.cookies.pl_test_mode) {
    return req.cookies.pl_test_mode;
  }

  return await ipToMode({
    ip: req.ip,
    date: res.locals.req_date,
    authn_user_id: res.locals.authn_user.id,
  });
}

export async function ipToMode({
  ip,
  date,
  authn_user_id,
}: {
  ip: string | undefined;
  date: Date;
  authn_user_id: string;
}) {
  // Express's types indicate that `ip` may be undefined in some cases. We want
  // to ensure that we don't try to proceed without one.
  if (ip === undefined) throw new Error('IP address is required');

  return await callScalar('ip_to_mode', [ip, date, authn_user_id], EnumModeSchema);
}
