import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { AssessmentSet } from '../../lib/db-types.js';

export function InstructorCourseAdminSets({
  resLocals,
  assessmentSets,
}: {
  resLocals: Record<string, any>;
  assessmentSets: AssessmentSet[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Assessment Sets',
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Assessment sets</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Abbreviation</th>
                    <th>Name</th>
                    <th>Heading</th>
                    <th>Color</th>
                  </tr>
                </thead>
                <tbody>
                  ${assessmentSets.map(function (assessment_set) {
                    return html`
                      <tr>
                        <td class="align-middle">${assessment_set.number}</td>
                        <td class="align-middle">
                          <span class="badge color-${assessment_set.color}">
                            ${assessment_set.abbreviation}
                          </span>
                        </td>
                        <td class="align-middle">${assessment_set.name}</td>
                        <td class="align-middle">${assessment_set.heading}</td>
                        <td class="align-middle">${assessment_set.color}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
