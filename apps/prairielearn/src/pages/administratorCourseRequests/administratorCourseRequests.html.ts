import { html } from '@prairielearn/html';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseRequestRow } from '../../lib/course-request.js';
import { Institution } from '../../lib/db-types.js';

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
        ${HeadContents({ resLocals, pageTitle: 'Course Requests' })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'courses' })}
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
