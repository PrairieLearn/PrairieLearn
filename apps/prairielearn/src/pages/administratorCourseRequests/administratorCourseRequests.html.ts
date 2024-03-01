import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function AdministratorCourseRequests({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", { ...resLocals })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'courses',
        })}
        <main id="content" class="container-fluid">
          ${renderEjs(__filename, "<%- include('courseRequestsTable') %>", {
            ...resLocals,
            show_all: true,
          })}
        </main>
      </body>
    </html>
  `.toString();
}
