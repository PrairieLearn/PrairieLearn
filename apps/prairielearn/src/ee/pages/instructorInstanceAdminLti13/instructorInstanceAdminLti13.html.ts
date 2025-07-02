import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.html.js';
import { type Lti13Instance } from '../../../lib/db-types.js';

export function InstructorInstanceAdminLti13NoInstances({
  resLocals,
  lti13_instances,
}: {
  resLocals: Record<string, any>;
  lti13_instances: Lti13Instance[];
}): string {
  return PageLayout({
    resLocals,
    pageTitle: 'Integrations',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'integrations',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Integrations with other learning systems</h1>
        </div>
        <div class="card-body">
          ${lti13_instances.length === 0
            ? html`
                <p>
                  No learning management systems (LMSes) at your institution are available for
                  integration with PrairieLearn. Please contact your IT administrators to set up an
                  integration. You can refer them to the
                  <a target="_blank" href="https://prairielearn.readthedocs.io/en/latest/lti13/"
                    >documentation</a
                  >.
                </p>
              `
            : html`
                <p>
                  The following learning management systems (LMSes) at your institution are
                  available for integration with PrairieLearn:
                </p>

                <ul>
                  ${lti13_instances.map((i) => {
                    return html`<li>${i.name}</li>`;
                  })}
                </ul>
                <p>
                  <a
                    target="_blank"
                    href="https://prairielearn.readthedocs.io/en/latest/lmsIntegrationInstructor/"
                  >
                    How can I integrate my course with an LMS?
                  </a>
                </p>
              `}
          <p class="mb-0">
            Integrating will allow you to push assessment scores from PrairieLearn to the LMS.
          </p>
        </div>
      </div>
    `,
  });
}
