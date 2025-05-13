import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../../lib/db-types.js';
import { LineitemSchema } from '../../lib/lti13.js';

export const AssessmentRowSchema = AssessmentSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
  lineitem: LineitemSchema.nullish(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export function InstructorInstanceAdminLti13AssignmentSelection({ resLocals, assessments }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 Assignment Selection' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="m-3">
          <p>
            Do you want to overwrite the Canvas assignment name? Points count? Ask this before this
            post so we can build the appropriate response.
          </p>

          <p>Select an existing PrairieLearn assessment to use with this assignment.</p>

          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="confirm" />
            <table>
              <tr>
                <th colspan="2">Assessment by group</th>
                <th>Linked in LMS</th>
              </tr>
              ${assessments.map((row) => {
                const start_new_assessment_group = row.start_new_assessment_group
                  ? html`<tr>
                      <th colspan="3">${row.assessment_group_heading}</th>
                    </tr>`
                  : '';

                return html`
                  ${start_new_assessment_group}
                  <tr>
                    <td>
                      <label for="option-${row.id}">
                        <input
                          type="radio"
                          name="unsafe_assessment_id"
                          id="option-${row.id}"
                          value="${row.id}"
                          required
                        />
                        <span class="badge color-${row.color}">${row.label}</span>
                      </label>
                    </td>
                    <td>
                      <label for="option-${row.id}">
                        ${row.title}
                        ${row.group_work
                          ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                          : ''}
                      </label>
                    </td>
                    <td>
                      <label for="option-${row.id}">
                        <!-- ${row.tid} -->
                        ${row.lineitem?.label ?? ''}
                      </label>
                    </td>
                  </tr>
                `;
              })}
            </table>
            <button class="btn btn-primary my-2">Continue</button>
          </form>
        </main>
      </body>
    </html>
  `.toString();
}

export function InstructorInstanceAdminLti13AssignmentDetails({ resLocals, assessment }) {
  return html`OK`.toString();
}

export function InstructorInstanceAdminLti13AssignmentConfirmation({
  resLocals,
  deep_link_return_url,
  signed_jwt,
  platform_name,
  assessment,
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 Assignment Selection' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="m-3">
          <p>
            Confirmation: You selected PrairieLearn assessment <strong>${assessment.title}</strong>
          </p>

          <p>Extra settings: Rename, set points, open in new window, ....?</p>

          <script>
            const dataToSend = { JWT: '${signed_jwt}', return_url: '${deep_link_return_url}' };
            function sendIt() {
              if (window.opener) {
                window.opener.postMessage(dataToSend);
              } else {
                console.warn('No opener found to send message to');
              }
            }
          </script>

          <div id="response"></div>

          <form id="linkForm" method="POST" hx-post="" hx-target="#response" hx-swap="innerHTML">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="link" />
            <input type="hidden" name="unsafe_assessment_id" value="${assessment.id}" />
            <input type="hidden" name="unsafe_resourceId" value="${assessment.uuid}" />

            <button type="submit" class="btn btn-primary" onClick="sendIt();window.close();">
              Confirm
            </button>
          </form>
        </main>
      </body>
    </html>
  `.toString();
}
