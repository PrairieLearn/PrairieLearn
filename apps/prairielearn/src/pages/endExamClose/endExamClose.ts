import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { html } from '@prairielearn/html';

const router = Router();

const CLOSE_URL = '/pl/end-exam-close?rldbxb=1&rldbqn=1';

/**
 * PL-hosted two-hop LDB exit handshake. `/pl/end-exam` redirects here
 * with `?rldbsm=1` (LDB drops to medium security); the page then
 * meta-refreshes to `?rldbxb=1`, which LDB intercepts to exit.
 *
 * Falls back to a static page when not in an LDB session, or when
 * `rldbxb=1` reaches the server (LDB should have intercepted it), to
 * avoid an infinite refresh loop.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Presence check, not equality — Express's qs parser can yield an
    // array for duplicated params.
    if (!req.session.lockdown_browser || 'rldbxb' in req.query) {
      res.send(
        html`<!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>LockDown Browser closed</title>
              <meta name="robots" content="noindex" />
            </head>
            <body>
              <p>You may now close this window.</p>
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
            <p>Closing LockDown Browser…</p>
            <p>
              <a href="${CLOSE_URL}">Click here if the browser does not close automatically.</a>
            </p>
          </body>
        </html>`.toString(),
    );
  }),
);

export default router;
