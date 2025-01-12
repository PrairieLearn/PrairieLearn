import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type AssessmentSet } from '../../lib/db-types.js';

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
        ${HeadContents({ resLocals, pageTitle: 'Assessment Sets' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Assessment sets</h1>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped" aria-label="Assessment sets">
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
