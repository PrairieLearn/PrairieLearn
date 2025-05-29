import { html, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type Lti13Assessments } from '../../../lib/db-types.js';
import type { AssessmentRow } from '../../../models/assessment.js';

export function InstructorInstanceAdminLti13AssignmentSelection({
  resLocals,
  assessments,
  assessmentsGroupBy,
  lti13AssessmentsByAssessmentId,
  courseName,
  lmsName,
}: {
  resLocals: Record<string, any>;
  assessments: AssessmentRow[];
  assessmentsGroupBy: 'Set' | 'Module';
  lti13AssessmentsByAssessmentId: Record<string, Lti13Assessments>;
  courseName: string;
  lmsName: string;
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
          <h1>Assignment linking (step 1 of 2)</h1>

          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__action" value="confirm" />

            <h2>Options</h2>
            <p>Ask ${lmsName} to...</p>
            <div class="form-check ml-3">
              <input class="form-check-input" type="checkbox" name="setName" id="setName" />
              <label class="form-check-label" for="setName">
                set the name of the assignment to match PrairieLearn.
              </label>
            </div>

            <div class="form-check ml-3">
              <input class="form-check-input" type="checkbox" name="setText" id="setText" />
              <label class="form-check-label" for="setText">
                set the description of the assignment to match PrairieLearn.
              </label>
            </div>

            <div class="form-check ml-3">
              <input class="form-check-input" type="checkbox" name="setPoints" id="setPoints" />
              <label class="form-check-label" for="setPoints">
                set the points for the assignment to 100.
              </label>
            </div>

            <h2 class="mt-3">Select a PrairieLearn assessment to link.</h2>

            <table class="table table-sm">
              <tr>
                <th colspan="2">Assessment by group</th>
                <th>Linked in ${lmsName} ${courseName}</th>
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
  contentItem,
  signed_jwt,
  lmsName,
  assessment,
}: {
  resLocals: Record<string, any>;
  deep_link_return_url: string;
  contentItem: Record<string, any>;
  signed_jwt: string;
  lmsName: string;
  assessment: AssessmentRow;
}) {
  console.log(contentItem);
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 Assignment Selection' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="m-3">
          <h1>Assignment linking (step 2 of 2)</h1>
          <h2>Confirm the following configuration:</h2>

          <p>
            Link PrairieLearn assessment
            <a href="${contentItem.url}">
              <span class="badge color-${assessment.assessment_set.color}">
                ${assessment.label}</span
              >${assessment.title}</a
            >.
          </p>

          ${'title' in contentItem
            ? html`
                <p>
                  Ask ${lmsName} to name the assignment <strong>${contentItem.title}</strong> (You
                  can update it later.)
                </p>
              `
            : ''}
          ${'text' in contentItem
            ? html`
                <p>
                  Ask ${lmsName} to add this description to the assignment: (You can update it
                  later.
                </p>
                <div class="card bg-light mb-2">
                  <div class="card-body">${unsafeHtml(contentItem.text)}</div>
                </div>
              `
            : ''}
          ${'lineItem' in contentItem
            ? html`
                <p>
                  Ask ${lmsName} to set the total points for the assignment to 100. (You can update
                  it later.)
                </p>
              `
            : ''}

          <script>
            function sendIt() {
              if (window.opener) {
                window.opener.postMessage({
                  JWT: '${signed_jwt}',
                  return_url: '${deep_link_return_url}',
                });
              } else {
                console.warn('No opener found to send message to');
              }
            }
          </script>

          <button class="btn btn-primary" onClick="sendIt();window.close();">
            Send this information to ${lmsName}
          </button>
          <button class="btn btn-secondary" onClick="history.back();">Go back</button>
        </main>
      </body>
    </html>
  `.toString();
}
