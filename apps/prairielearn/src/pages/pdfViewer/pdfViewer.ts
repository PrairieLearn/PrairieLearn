import { Router } from 'express';

import { html } from '@prairielearn/html';

import { compiledScriptTag } from '../../lib/assets.js';

const router = Router();

router.get('/', (req, res) => {
  // Safari applies the creating document's framing policy to PDF blobs. Only
  // this viewer can be framed; question pages retain their stricter policy.
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self';");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.send(
    html`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>PDF preview</title>
        </head>
        <body style="margin: 0;">
          <iframe
            title="PDF preview"
            style="display: block; width: 100vw; height: 100vh; border: 0;"
          ></iframe>
          ${compiledScriptTag('pdfViewerClient.ts')}
        </body>
      </html>
    `.toString(),
  );
});

export default router;
