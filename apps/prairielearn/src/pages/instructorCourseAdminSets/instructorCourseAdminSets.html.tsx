import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { type AssessmentSet } from '../../lib/db-types.js';

export function InstructorCourseAdminSets({
  resLocals,
  assessmentSets,
}: {
  resLocals: Record<string, any>;
  assessmentSets: AssessmentSet[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Assessment Sets',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'sets',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
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
                    <td class="align-middle">${AssessmentSetHeading({ assessment_set })}</td>
                    <td class="align-middle">${assessment_set.color}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>
    `,
  });
}
