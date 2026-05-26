import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { EndExamBridge } from '../../components/EndExamBridge.js';
import { generateEndExamJwt } from '../../ee/auth/endExamJwt.js';
import { config } from '../../lib/config.js';

const router = Router();

/**
 * Receives the click on the "End exam" navbar control inside a LockDown
 * Browser session. Mints a fresh short-lived JWT (so we never have to
 * worry about an expiring token sitting on a page) and responds with an
 * auto-submitting bridge form that POSTs the JWT to PrairieTest's
 * `/pt/auth/prairielearn/end-exam` callback. PT ends the reservation and
 * redirects with `rldbxb=1`, which exits LockDown Browser.
 *
 * Authentication is the standard PrairieLearn session cookie; CSRF is the
 * standard form token. The cross-origin JWT we hand to PT is generated
 * here, on the back of an authenticated request, so a client-rendered
 * page or a stale tab never holds it.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (
      !req.session.lockdown_browser ||
      !req.session.reservation_id ||
      req.session.user_id == null
    ) {
      throw new HttpStatusError(400, 'End exam is only available in a LockDown Browser session.');
    }

    const jwt = await generateEndExamJwt({
      user_id: String(req.session.user_id),
      reservation_id: req.session.reservation_id,
    });

    res.send(
      EndExamBridge({
        jwt,
        ptEndExamUrl: `${config.ptHost}/pt/auth/prairielearn/end-exam`,
      }),
    );
  }),
);

export default router;
