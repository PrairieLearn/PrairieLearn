import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { PageLayout } from '../../../components/PageLayout.js';
import type { Lti13Instance } from '../../../lib/db-types.js';

export function LinkedLtiUserRequired({
  instancesWithMissingIdentities,
  resLocals,
}: {
  instancesWithMissingIdentities: { lti13_instance: Lti13Instance; lti13_user_id: string | null }[];
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    pageTitle: 'Missing LTI connection',
    navContext: {
      type: 'student',
      page: undefined,
    },
    resLocals,
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-warning">
          <h1>Missing LTI connection</h1>
        </div>
        <div class="card-body">
          ${run(() => {
            if (instancesWithMissingIdentities.length === 1) {
              const instance = instancesWithMissingIdentities[0].lti13_instance;
              return html`
                <p>
                  To continue, please log into PrairieLearn via <strong>${instance.name}</strong>.
                  This creates a connection between your PrairieLearn account and your
                  ${instance.name} account.
                </p>
              `;
            }

            return html`
              <p>
                To continue to this course, please log into PrairieLearn via all of the following
                platforms:
              </p>
              <ul>
                ${instancesWithMissingIdentities.map(
                  ({ lti13_instance }) => html`<li><strong>${lti13_instance.name}</strong></li>`,
                )}
              </ul>
              <p>
                This will create a connection between your PrairieLearn account and your accounts on
                these platforms.
              </p>
            `;
          })}

          <p class="mb-0">
            After completing this step, you'll be able to access this course directly in
            PrairieLearn in the future.
          </p>
        </div>
      </div>
    `,
  });
}
