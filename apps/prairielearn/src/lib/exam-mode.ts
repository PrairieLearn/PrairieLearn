import type { Request, Response } from 'express';
import z from 'zod';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

import { config } from './config.js';
import { type EnumMode } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

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
  ip: string | null | undefined;
  date: Date;
  authn_user_id: string;
}): Promise<EnumMode> {
  // Express's types indicate that `ip` may be undefined in some cases. We want
  // to ensure that we don't try to proceed without one.
  if (ip == null) throw new Error('IP address is required');

  const hasPrairieTestReservation = await queryScalar(
    sql.select_active_prairietest_reservation,
    { ip, date, authn_user_id },
    z.boolean(),
  );
  return hasPrairieTestReservation ? 'Exam' : 'Public';
}
