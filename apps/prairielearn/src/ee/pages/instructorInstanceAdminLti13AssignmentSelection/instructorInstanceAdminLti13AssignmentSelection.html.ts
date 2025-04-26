import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../../lib/db-types.js';
import { getCanonicalHost } from '../../../lib/url.js';

export const AssessmentRowSchema = AssessmentSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
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
          <p>Select an existing PrairieLearn assessment to use with this assignment.</p>

          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="confirm" />
            <table>
              ${assessments.map((row) => {
                console.log(row);

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
                      value="${row.id}" required>
                      <span class="badge color-${row.color}">${row.label}</span>
                      </label>
                      </td>
                      <td>
                        <label for="option-${row.id}">
                        ${row.title}
                        ${
                          row.group_work
                            ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                            : ''
                        }
                        </label>
                    </td>
                    <td>
                    <label for="option-${row.id}">
                    ${row.tid}
                    </label>
                    </td>
                  </tr>
                </label>`;
              })}
            </table>
            <button class="btn btn-primary my-2">Continue</button>
          </form>
        </main>
      </body>
    </html>
  `.toString();
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

          <form id="linkForm" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="link" />
            <input type="hidden" name="unsafe_assessment_id" value="${assessment.id}" />
            <input type="hidden" name="unsafe_resourceId" value="${assessment.uuid}" />
            <input type="submit" value="Link form" />
          </form>

          <form id="LMSForm" method="POST" action="${deep_link_return_url}">
            <input type="hidden" name="JWT" value="${signed_jwt}" />
            <input
              class="btn btn-success"
              type="submit"
              value="Update link in ${platform_name}"
              onClick="event.preventDefault();
              console.log('Got to here');
              document.getElementById('linkForm').submit();
              document.getElementById('LMSForm').submit();"
            />
          </form>
        </main>
      </body>
    </html>
  `.toString();
}
