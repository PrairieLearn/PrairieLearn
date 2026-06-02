import asyncHandler from 'express-async-handler';

import { LockdownBrowserRequiredError, isLockdownBrowserBlocked } from '../lib/exam-mode.js';

/**
 * Denies all PrairieLearn access to a user with an active
 * LockDown-Browser-required reservation whose session was not established from
 * inside LockDown Browser. This runs against the authenticated user right after
 * authentication so the denial applies to every page, not just exam-scoped
 * ones. Staff emulating a student are unaffected: emulation overrides the
 * effective user, not the authenticated user, and staff hold no reservation.
 */
export default asyncHandler(async (req, res, next) => {
  if (!res.locals.authn_user) {
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
