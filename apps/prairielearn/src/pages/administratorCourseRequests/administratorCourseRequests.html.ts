import { html } from '@prairielearn/html';

import { CourseRequestsTable } from '../../components/CourseRequestsTable.js';
import { PageLayout } from '../../components/PageLayout.js';
import { type CourseRequestRow } from '../../lib/course-request.js';
import { type Institution } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function AdministratorCourseRequests({
  rows,
  institutions,
  coursesRoot,
  resLocals,
}: {
  rows: CourseRequestRow[];
  institutions: Institution[];
  coursesRoot: string;
  resLocals: ResLocalsForPage<'plain'>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Course Requests',
    navContext: {
      type: 'administrator',
      page: 'admin',
      subPage: 'courses',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <h1 class="visually-hidden">All Course Requests</h1>
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
