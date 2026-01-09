import type { Request, Response } from 'express';
import { z } from 'zod';

import { callRow } from '@prairielearn/postgres';

import { config } from './config.js';
import {
  type EnumMode,
  type EnumModeReason,
  EnumModeReasonSchema,
  EnumModeSchema,
} from './db-types.js';

export async function getModeForRequest(
  req: Request,
  res: Response,
): Promise<{ mode: EnumMode; mode_reason: EnumModeReason }> {
  // If we're lucky, `authzCourseOrInstance` has already populated the mode.
  if (res.locals.authz_data?.mode && res.locals.authz_data?.mode_reason) {
    return {
      mode: res.locals.authz_data.mode,
      mode_reason: res.locals.authz_data.mode_reason,
    };
  }

  const result = await ipToMode({
    ip: req.ip,
    date: res.locals.req_date,
    authn_user_id: res.locals.authn_user.id,
  });

  // This function can be run independently of `authzCourseOrInstance`, which is
  // normally responsible for handling the `pl_test_mode` cookie. We'll
  // duplicate that logic here so that it works in all contexts.
  //
  // We avoid setting `mode_reason` to mimic the behavior of `authzCourseOrInstance`.
  if (config.devMode && req.cookies.pl_test_mode) {
    result.mode = req.cookies.pl_test_mode;
  }

  return result;
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

  return await callRow(
    'ip_to_mode',
    [ip, date, authn_user_id],
    z.object({ mode: EnumModeSchema, mode_reason: EnumModeReasonSchema }),
  );
}
