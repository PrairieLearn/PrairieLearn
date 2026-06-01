import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { html } from '@prairielearn/html';

import { getEndExamExitUrl } from '../../lib/client/url.js';

const router = Router();

const CLOSE_URL = getEndExamExitUrl();

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

export default router;
