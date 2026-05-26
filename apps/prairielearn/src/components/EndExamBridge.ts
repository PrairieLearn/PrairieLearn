import { html } from '@prairielearn/html';

/**
 * Auto-submitting bridge page that POSTs the freshly-minted end-exam JWT to
 * PrairieTest's `/pt/auth/prairielearn/end-exam` callback. The JWT lives
 * only in the form body of this transient page — never in `res.locals`,
 * never on a long-lived page, never visible to client-rendered components
 * — so it can't be siphoned off by a stale tab or a future client-render
 * of the navbar.
 *
 * Mirrors the shape of PrairieTest's `AuthPrairieLearn` bridge in the
 * reverse direction.
 */
export function EndExamBridge({
  jwt,
  ptEndExamUrl,
}: {
  jwt: string;
  ptEndExamUrl: string;
}): string {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Ending exam</title>
        <meta name="robots" content="noindex" />
      </head>
      <body>
        <main>
          <form id="end-exam-form" action="${ptEndExamUrl}" method="POST">
            <input type="hidden" name="jwt" value="${jwt}" />
            <noscript>
              <p>Click the button below to end your exam.</p>
              <button type="submit">End exam</button>
            </noscript>
          </form>
        </main>
        <script>
          (function () {
            function submitForm() {
              document.getElementById('end-exam-form').submit();
            }
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
              submitForm();
            } else {
              document.addEventListener('DOMContentLoaded', submitForm);
            }
          })();
        </script>
      </body>
    </html>`.toString();
}
