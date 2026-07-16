import asyncHandler from 'express-async-handler';

import { LockdownBrowserRequiredError, isLockdownBrowserBlocked } from '../lib/exam-mode.js';

function isPrairieTestAuthRequest(req: { method: string; path: string }): boolean {
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
  if (!res.locals.authn_user || isPrairieTestAuthRequest(req)) {
    next();
    return;
  }

  const blocked = await isLockdownBrowserBlocked({
    ip: req.ip ?? null,
    date: res.locals.req_date,
    authn_user_id: res.locals.authn_user.id,
    // API requests skip session middleware, so `req.session` can be absent at runtime.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    session_is_lockdown_browser: req.session?.lockdown_browser ?? false,
  });

  if (blocked) {
    throw new LockdownBrowserRequiredError();
  }

  next();
});
