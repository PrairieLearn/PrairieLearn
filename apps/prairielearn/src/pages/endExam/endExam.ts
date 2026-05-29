import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { generateEndExamJwt } from '../../ee/auth/endExamJwt.js';
import { config } from '../../lib/config.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

const PT_END_EXAM_TIMEOUT_MS = 10_000;

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
    if (!reservation) {
      throw new HttpStatusError(400, 'No active LockDown Browser reservation found for this user.');
    }

    const jwt = await generateEndExamJwt({ user_id, reservation_id: reservation.id });

    // Drive the LDB close regardless of PT's response. Leaving the student
    // stuck inside LDB on a transient PT error is worse than the
    // reservation not being ended — they can retry from a regular browser
    // once they're out. We log so operators can chase the failure.
    try {
      const ptResponse = await fetch(
        new URL('/pt/auth/prairielearn/end-exam', config.ptHost).toString(),
        {
          method: 'POST',
          body: new URLSearchParams({ jwt }),
          signal: AbortSignal.timeout(PT_END_EXAM_TIMEOUT_MS),
        },
      );
      if (!ptResponse.ok) {
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

    res.redirect(303, '/pl/end-exam-close?rldbsm=1&rldbqn=1');
  }),
);

export default router;
