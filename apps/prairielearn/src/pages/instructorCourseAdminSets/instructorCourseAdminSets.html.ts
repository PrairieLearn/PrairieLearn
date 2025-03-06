import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type AssessmentSet } from '../../lib/db-types.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';

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
                  ${AssessmentSetHeading({assessment_set: assessment_set})}
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>
    `,
  });
}
