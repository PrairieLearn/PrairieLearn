import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { generateEndExamJwt } from '../../ee/auth/endExamJwt.js';
import { getEndExamCloseUrl, getEndExamExitUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

const PT_END_EXAM_TIMEOUT_MS = 10_000;
const CLOSE_URL = getEndExamExitUrl();

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
 * PL-hosted two-hop LDB exit handshake. The POST handler redirects back to this
 * route with `?rldbsm=1` (LDB drops to medium security); the page then
 * meta-refreshes to `?rldbxb=1`, which LDB intercepts to exit.
 *
 * Falls back to a static page when not in an LDB session, when the close
 * handshake was not requested, or when `rldbxb=1` reaches the server (LDB
 * should have intercepted it), to avoid an infinite refresh loop.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Presence check, not equality — Express's qs parser can yield an
    // array for duplicated params.
    if (!req.session.lockdown_browser || !('rldbsm' in req.query) || 'rldbxb' in req.query) {
      res.send(
        html`<!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>LockDown Browser closed</title>
              <meta name="robots" content="noindex" />
            </head>
            <body>
              <main>
                <h1>LockDown Browser closed</h1>
                <p>You may now close this window.</p>
              </main>
            </body>
          </html>`.toString(),
      );
      return;
    }

    res.send(
      html`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Closing LockDown Browser…</title>
            <meta name="robots" content="noindex" />
            <meta http-equiv="refresh" content="0;url=${CLOSE_URL}" />
          </head>
          <body>
            <main>
              <h1>Closing LockDown Browser…</h1>
              <p>
                <a href="${CLOSE_URL}">Click here if the browser does not close automatically.</a>
              </p>
            </main>
          </body>
        </html>`.toString(),
    );
  }),
);

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
