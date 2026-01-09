import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function EnrollmentLimitExceededMessage({
  resLocals,
}: {
  resLocals: ResLocalsForPage<'plain'>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Enrollment - Courses',
    navContext: {
      type: 'plain',
      page: 'enroll',
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">Enrollment limit exceeded</div>
        <div class="card-body">
          This course has reached its enrollment limit. Please contact the course staff for more
          information.
        </div>
      </div>
    `,
  });
}
