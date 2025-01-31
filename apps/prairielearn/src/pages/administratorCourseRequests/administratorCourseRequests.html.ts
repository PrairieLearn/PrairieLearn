import { html } from '@prairielearn/html';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { type CourseRequestRow } from '../../lib/course-request.js';
import { type Institution } from '../../lib/db-types.js';

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
  return PageLayout({
    resLocals,
    pageTitle: 'Course Requests',
    navContext: {
      type: 'plain',
      page: 'admin',
      subPage: 'courses',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <h1 class="sr-only">All Course Requests</h1>
      ${CourseRequestsTable({
        rows,
        institutions,
        coursesRoot,
        showAll: true,
        csrfToken: resLocals.__csrf_token,
        urlPrefix: resLocals.urlPrefix,
      })}
    `,
  });
}
