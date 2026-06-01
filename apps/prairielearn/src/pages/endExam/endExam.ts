import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { generateEndExamJwt } from '../../ee/auth/endExamJwt.js';
import { getEndExamCloseUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

const PT_END_EXAM_TIMEOUT_MS = 10_000;

/**
 * Finds the user's currently-active LDB-required reservation, looked up at
 * End exam click time so the session needn't persist a PT-supplied id across
 * PL's session regeneration. The LDB flag sits on `pt_sessions` for a
 * course-run session and on `pt_locations` for a center session (COALESCE
 * collapses both); returns null when none is active.
 */
export async function selectActiveLockdownBrowserReservation({
  authn_user_id,
  date,
}: {
  authn_user_id: string;
  date: Date;
}): Promise<{ id: string } | null> {
  return await queryOptionalRow(
    sql.select_active_lockdown_browser_reservation,
    { authn_user_id, date },
    z.object({ id: z.string() }),
  );
}

/**
 * Receives the click on the LDB navbar End exam button: looks up the
 * student's active LDB reservation, server-to-server calls PT to end it,
 * then redirects into PL's close handshake to exit LDB.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.session.lockdown_browser || req.session.user_id == null) {
      throw new HttpStatusError(400, 'End exam is only available in a LockDown Browser session.');
    }

    const user_id = String(req.session.user_id);
    const reservation = await selectActiveLockdownBrowserReservation({
      authn_user_id: user_id,
      date: new Date(),
    });

    // Nothing active to protect, so it's safe to exit LDB. Also the exit path
    // after a proctor ends the reservation from PT: the next click finds
    // nothing and closes LDB.
    if (!reservation) {
      res.redirect(303, getEndExamCloseUrl());
      return;
    }

    const jwt = await generateEndExamJwt({ user_id, reservation_id: reservation.id });

    // Only exit LDB once PT confirms the reservation ended — releasing the
    // student while it's still active would let them browse and return. On
    // failure, keep them in LDB with a retryable error (a proctor can end it
    // from PT).
    let ended = false;
    try {
      const ptResponse = await fetch(
        new URL('/pt/lockdown-browser/end-exam', config.ptHost).toString(),
        {
          method: 'POST',
          body: new URLSearchParams({ jwt }),
          signal: AbortSignal.timeout(PT_END_EXAM_TIMEOUT_MS),
        },
      );
      if (ptResponse.ok) {
        ended = true;
      } else {
        logger.error('PrairieTest end-exam call returned non-ok', {
          status: ptResponse.status,
          statusText: ptResponse.statusText,
          user_id,
          reservation_id: reservation.id,
        });
      }
    } catch (err) {
      logger.error('PrairieTest end-exam call threw', {
        err,
        user_id,
        reservation_id: reservation.id,
      });
    }

    if (!ended) {
      throw new HttpStatusError(
        502,
        'Unable to end the exam. Please try again, or ask your proctor to end it for you.',
      );
    }

    res.redirect(303, getEndExamCloseUrl());
  }),
);

export default router;
