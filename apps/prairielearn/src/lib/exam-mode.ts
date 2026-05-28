import type { Request, Response } from 'express';
import z from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { config } from './config.js';
import { type EnumMode } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * The mode resolved for a single request. This is `EnumMode` plus the
 * transient `'Blocked'` verdict, which denies the request outright. Unlike
 * `EnumMode`, `'Blocked'` is never persisted: the authorization layer
 * translates it into a 403 before it can reach the database.
 */
export type RequestMode = EnumMode | 'Blocked';

const ActiveReservationInfoSchema = z.object({
  exam_mode: z.boolean(),
  requires_lockdown_browser: z.boolean(),
});

export async function getModeForRequest(req: Request, res: Response): Promise<RequestMode> {
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
 * Returns `'Blocked'` when the user has an in-progress
 * LockDown-Browser-required reservation but the current session was not
 * established from inside LockDown Browser and `enforce_lockdown_browser` is
 * true. The authorization layer translates that verdict into a 403, denying
 * all PrairieLearn access (not just exam pages) for the duration of the
 * exam — this is a returned value rather than a thrown error so the resolver
 * stays free of access-control side effects.
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
 * while the exam runs.
 *
 * Callers that rebuild authorization for a staff-requested effective user can
 * disable enforcement after the authenticated user has already been checked.
 */
export async function ipToMode({
  ip,
  date,
  authn_user_id,
  session_is_lockdown_browser,
  enforce_lockdown_browser = true,
}: {
  ip: string | null | undefined;
  date: Date;
  authn_user_id: string;
  session_is_lockdown_browser: boolean;
  enforce_lockdown_browser?: boolean;
}): Promise<RequestMode> {
  // Express's types indicate that `ip` may be undefined in some cases. We want
  // to ensure that we don't try to proceed without one.
  if (ip == null) throw new Error('IP address is required');

  const { exam_mode, requires_lockdown_browser } = await queryRow(
    sql.select_active_prairietest_reservation,
    { ip, date, authn_user_id },
    ActiveReservationInfoSchema,
  );

  if (enforce_lockdown_browser && requires_lockdown_browser && !session_is_lockdown_browser) {
    return 'Blocked';
  }

  return exam_mode ? 'Exam' : 'Public';
}
