import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function StudentCourseInstanceUpgrade({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head') %>", {
          ...resLocals,
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          // This won't actually render anything on the page; it just has to be non-null.
          navPage: 'upgrade',
        })}
        <main class="container mb-4 text-center">
          <div class="d-flex flex-column justify-content-center">
            <i class="fa-solid fa-lock fa-2xl"></i>
            <h1>Upgrade required</h1>
            <p>
              This course requires an upgrade to support certain features selected by your
              instructor.
            </p>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
