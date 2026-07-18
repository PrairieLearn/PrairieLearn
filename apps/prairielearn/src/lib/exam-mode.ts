import type { Request, Response } from 'express';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
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

/**
 * Looks up the user's active PrairieTest reservations and returns the derived
 * per-request state: whether they're in 'Exam' mode, whether they must be
 * inside LockDown Browser, and the id of an active in-access-window reservation
 * (used to show the "Report cheating" control), or null if none.
 */
export async function selectActiveReservationInfo({
  ip,
  date,
  authn_user_id,
}: {
  ip: string | null | undefined;
  date: Date;
  authn_user_id: string;
}): Promise<ActiveReservationInfo> {
  // Express's types indicate that `ip` may be undefined in some cases. We want
  // to ensure that we don't try to proceed without one.
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

/**
 * Error thrown when a user with an active LockDown-Browser-required reservation
 * accesses PrairieLearn from a session that was not established inside LockDown
 * Browser. The denial is global (not just exam pages), so it's raised from the
 * `enforceLockdownBrowser` middleware rather than per page.
 *
 * Attack vector this guards against:
 *
 *   1. A student launches their LDB-required PrairieTest reservation
 *      through LockDown Browser, completing the PT → PL auth handoff.
 *      LDB enforces its restrictions only on that browser process.
 *   2. A second person opens a separate browser on a different computer
 *      on the same network, signs in to PrairieLearn as that student
 *      directly via Shibboleth / Google / SAML / LTI, and helps with the
 *      exam. Without this check, that session is in `'Exam'` mode (active
 *      PT reservation, matching IP) but has none of LDB's restrictions —
 *      they can copy/paste, open external tabs, screenshot, screen-share,
 *      etc.
 *
 * Refusing all access matches the policy that an LDB-required reservation
 * confines the user to LDB for its full duration. A student in a non-LDB
 * browser would otherwise be free to look up answers in other course pages
 * while the exam runs. The decision uses `requires_lockdown_browser` from
 * {@link selectActiveReservationInfo}.
 */
export class LockdownBrowserRequiredError extends HttpStatusError {
  constructor() {
    super(
      403,
      'This user has an active LockDown Browser reservation. PrairieLearn must be accessed from inside LockDown Browser for the duration of the exam.',
    );
  }
}
