import type { Request } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { selectActiveReservationInfo } from '../lib/exam-mode.js';

function isPrairieTestAuthRequest(req: Request): boolean {
  return (
    req.method === 'GET' &&
    (req.path === '/pl/prairietest/auth' || req.path === '/pl/prairietest/auth/')
  );
}

/**
 * Selects active PrairieTest reservation information for downstream authorization
 * and UI code. It also denies all PrairieLearn access to a user with an active
 * LockDown-Browser-required reservation whose session was not established from
 * inside LockDown Browser. This runs against the authenticated user right after
 * authentication so the denial applies to every page, not just exam-scoped ones.
 * Staff emulating a student are unaffected: emulation overrides the effective
 * user, not the authenticated user, and staff hold no reservation. The
 * PrairieLearn-to-PrairieTest authentication handoff is exempt because students
 * must complete it before they can launch LockDown Browser.
 *
 * Attack vector the LockDown Browser denial guards against:
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
 */
export default asyncHandler(async (req, res, next) => {
  // Students begin the PrairieTest sign-in flow in a regular browser, then launch
  // LockDown Browser from PrairieTest. This route only hands the authenticated user
  // off to PrairieTest, so it must remain reachable after the student is checked in.
  //
  // We do not limit access even after the student has started their reservation.
  // They may need to resume on a different machine during an in-progress session,
  // e.g. because of hardware failure.
  if (!res.locals.authn_user || isPrairieTestAuthRequest(req)) {
    next();
    return;
  }

  const info = await selectActiveReservationInfo({
    ip: req.ip ?? null,
    date: res.locals.req_date,
    authn_user_id: res.locals.authn_user.id,
  });

  res.locals.prairietest_reservation_info = info;

  // API requests skip session middleware, so `req.session` can be absent at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const session_is_lockdown_browser = req.session?.lockdown_browser ?? false;
  if (info.requires_lockdown_browser && !session_is_lockdown_browser) {
    throw new HttpStatusError(
      403,
      'This user has an active LockDown Browser reservation. PrairieLearn must be accessed from inside LockDown Browser for the duration of the exam.',
    );
  }

  next();
});
