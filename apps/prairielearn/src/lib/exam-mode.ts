import type { Request, Response } from 'express';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { config } from './config.js';
import { type EnumMode } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const ActiveReservationInfoSchema = z.object({
  exam_mode: z.boolean(),
  requires_lockdown_browser: z.boolean(),
});

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
    session_is_lockdown_browser: req.session.lockdown_browser ?? false,
  });
}

/**
 * Resolves the request mode based on the user's active PrairieTest
 * reservations and IP address.
 *
 * Throws an `HttpStatusError(403)` when the user has an in-progress
 * LockDown-Browser-required reservation but the current session was not
 * established from inside LockDown Browser.
 *
 * Attack vector this guards against:
 *
 *   1. A student launches their LDB-required PrairieTest reservation
 *      through LockDown Browser, completing the PT → PL auth handoff.
 *      LDB enforces its restrictions only on that browser process.
 *   2. On the same machine (or any device on the same network), they open
 *      a separate browser and sign in to PrairieLearn directly via
 *      Shibboleth / Google / SAML / LTI. Without this check, that
 *      session is in `'Exam'` mode (active PT reservation, matching IP)
 *      but has none of LDB's restrictions — they can copy/paste, open
 *      external tabs, screenshot, screen-share, etc.
 *
 * Refusing all access (not just exam pages) during the LDB window matches
 * the policy that an LDB-required reservation confines the user to LDB
 * for its full duration. A student in a non-LDB browser would otherwise
 * be free to look up answers in other course pages while the exam runs.
 */
export async function ipToMode({
  ip,
  date,
  authn_user_id,
  session_is_lockdown_browser,
}: {
  ip: string | null | undefined;
  date: Date;
  authn_user_id: string;
  session_is_lockdown_browser: boolean;
}): Promise<EnumMode> {
  // Express's types indicate that `ip` may be undefined in some cases. We want
  // to ensure that we don't try to proceed without one.
  if (ip == null) throw new Error('IP address is required');

  const { exam_mode, requires_lockdown_browser } = await queryRow(
    sql.select_active_prairietest_reservation,
    { ip, date, authn_user_id },
    ActiveReservationInfoSchema,
  );

  if (requires_lockdown_browser && !session_is_lockdown_browser) {
    throw new HttpStatusError(
      403,
      'This user has an active LockDown Browser reservation. PrairieLearn must be accessed from inside LockDown Browser for the duration of the exam.',
    );
  }

  return exam_mode ? 'Exam' : 'Public';
}
