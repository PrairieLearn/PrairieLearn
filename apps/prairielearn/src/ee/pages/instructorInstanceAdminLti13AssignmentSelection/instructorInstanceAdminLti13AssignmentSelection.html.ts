import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type Lti13Assessments } from '../../../lib/db-types.js';
import type { AssessmentRow } from '../../../models/assessment.js';

export function InstructorInstanceAdminLti13AssignmentSelection({
  resLocals,
  assessments,
  assessmentsGroupBy,
  lti13AssessmentsByAssessmentId,
}: {
  resLocals: Record<string, any>;
  assessments: AssessmentRow[];
  assessmentsGroupBy: 'Set' | 'Module';
  lti13AssessmentsByAssessmentId: Record<string, Lti13Assessments>;
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
            Do you want to overwrite the Canvas assignment name? Points count? Ask this before this
            post so we can build the appropriate response.
          </p>

          <p>Select an existing PrairieLearn assessment to use with this assignment.</p>

          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="confirm" />
            <table class="table table-sm">
              <tr>
                <th colspan="2">Assessment by group</th>
                <th>Linked in LMS</th>
              </tr>
              ${assessments.map((row) => {
                return html`
                  ${row.start_new_assessment_group
                    ? html`<tr>
                        <th colspan="3">
                          ${assessmentsGroupBy === 'Set'
                            ? row.assessment_set.heading
                            : row.assessment_module.heading}
                        </th>
                      </tr>`
                    : ''}
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
                        <span class="badge color-${row.assessment_set.color}">${row.label}</span>
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
                        ${lti13AssessmentsByAssessmentId[row.id]?.lineitem?.label ?? ''}
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

export function InstructorInstanceAdminLti13AssignmentConfirmation({
  resLocals,
  deep_link_return_url,
  deepLinkingResponse,
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
            Confirmation: You selected PrairieLearn assessment
            <strong>${assessment.label}: ${assessment.title}}</strong>
            <strong>${deepLinkingResponse.title}</strong>
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

          <button class="btn btn-primary" onClick="sendIt();window.close();">
            Send this information to ${platform_name}
          </button>
        </main>
      </body>
    </html>
  `.toString();
}
