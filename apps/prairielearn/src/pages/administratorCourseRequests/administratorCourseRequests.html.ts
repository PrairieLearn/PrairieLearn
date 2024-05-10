import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Institution } from '../../lib/db-types.js';
import { CourseRequestRow } from '../../lib/course-request.js';
import { CourseRequestsTable } from '../../components/CourseRequestsTable.html.js';

export function AdministratorCourseRequests({
  rows,
  institutions,
  coursesRoot,
  resLocals,
}: {
  rows: CourseRequestRow[];
  institutions: Institution[];
  coursesRoot: string;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", { ...resLocals })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'courses',
        })}
        <main id="content" class="container-fluid">
          ${CourseRequestsTable({
            rows,
            institutions,
            coursesRoot,
            showAll: true,
            csrfToken: resLocals.__csrf_token,
            urlPrefix: resLocals.urlPrefix,
          })}
        </main>
      </body>
    </html>
  `.toString();
}
