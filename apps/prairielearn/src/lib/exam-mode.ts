import type { Request, Response } from 'express';
import z from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from './config.js';
import { type EnumMode } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const ActiveReservationInfoSchema = z.object({
  exam_mode: z.boolean(),
  requires_lockdown_browser: z.boolean(),
  cheating_report_reservation_id: IdSchema.nullable(),
});
export type ActiveReservationInfo = z.infer<typeof ActiveReservationInfoSchema>;

export async function selectActiveReservationInfo({
  ip,
  date,
  authn_user_id,
}: {
  ip: string | null | undefined;
  date: Date;
  authn_user_id: string;
}): Promise<ActiveReservationInfo> {
  if (ip == null) throw new Error('IP address is required');

  return await queryRow(
    sql.select_active_prairietest_reservation,
    { ip, date, authn_user_id },
    ActiveReservationInfoSchema,
  );
}

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

  if (res.locals.prairietest_reservation_info) {
    return res.locals.prairietest_reservation_info.exam_mode ? 'Exam' : 'Public';
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
  const { exam_mode } = await selectActiveReservationInfo({ ip, date, authn_user_id });

  return exam_mode ? 'Exam' : 'Public';
}
