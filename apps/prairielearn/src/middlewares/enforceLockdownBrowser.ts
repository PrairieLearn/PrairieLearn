import type { Request } from 'express';
import asyncHandler from 'express-async-handler';

import { LockdownBrowserRequiredError, selectActiveReservationInfo } from '../lib/exam-mode.js';

function isPrairieTestAuthRequest(req: Request): boolean {
  return (
    req.method === 'GET' &&
    (req.path === '/pl/prairietest/auth' || req.path === '/pl/prairietest/auth/')
  );
}

/**
 * Denies all PrairieLearn access to a user with an active
 * LockDown-Browser-required reservation whose session was not established from
 * inside LockDown Browser. This runs against the authenticated user right after
 * authentication so the denial applies to every page, not just exam-scoped
 * ones. Staff emulating a student are unaffected: emulation overrides the
 * effective user, not the authenticated user, and staff hold no reservation. The
 * PrairieLearn-to-PrairieTest authentication handoff is exempt because students
 * must complete it before they can launch LockDown Browser.
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

  // The navbar's "Report cheating" control renders when the user has an active
  // in-access-window reservation whose owning center/course has opted in;
  // PrairieTest re-checks the opt-in when a report is actually submitted.
  res.locals.cheating_report_reservation_id = info.cheating_report_reservation_id;

  // API requests skip session middleware, so `req.session` can be absent at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const session_is_lockdown_browser = req.session?.lockdown_browser ?? false;
  if (info.requires_lockdown_browser && !session_is_lockdown_browser) {
    throw new LockdownBrowserRequiredError();
  }

  next();
});
