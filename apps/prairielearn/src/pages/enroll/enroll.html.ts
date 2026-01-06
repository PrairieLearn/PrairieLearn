import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export function EnrollPageRemoved({ resLocals }: { resLocals: UntypedResLocals }) {
  return PageLayout({
    resLocals,
    pageTitle: 'Enrollment - Courses',
    navContext: {
      type: 'plain',
      page: 'enroll',
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">Enrollment page removed</div>
        <div class="card-body">
          <p>The course listing page has been removed from PrairieLearn.</p>
          <p>To enroll in a course, your instructor must either:</p>
          <ul>
            <li>
              Provide a direct link or enrollment code to the course for you to enroll (these can be
              found on the settings page)
            </li>
            <li>Invite you to the course</li>
          </ul>
          <p>
            <a href="/pl" class="btn btn-primary">Go to homepage</a>
          </p>
        </div>
      </div>
    `,
  });
}

export function EnrollmentLimitExceededMessage({ resLocals }: { resLocals: UntypedResLocals }) {
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
