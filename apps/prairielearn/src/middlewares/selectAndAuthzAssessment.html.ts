import { html } from '@prairielearn/html';

import { PageLayout } from '../components/PageLayout.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

export function AccessDenied({ resLocals }: { resLocals: UntypedResLocals }) {
  return PageLayout({
    resLocals,
    pageTitle: 'Assessment unavailable',
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">Assessment unavailable</div>
        <div class="card-body">
          <p>This assessment's configuration does not allow you to access it right now.</p>
          <p>This is the intended behavior based on the current time or other factors.</p>
          <div>
            <a
              href="/pl/course_instance/${resLocals.course_instance.id}/assessments"
              class="btn btn-primary"
            >
              Go to assessments
            </a>
            <a href="/pl" class="btn btn-primary">
              <i class="fa fa-home" aria-hidden="true"></i>
              PrairieLearn home
            </a>
          </div>
        </div>
      </div>
    `,
  });
}
