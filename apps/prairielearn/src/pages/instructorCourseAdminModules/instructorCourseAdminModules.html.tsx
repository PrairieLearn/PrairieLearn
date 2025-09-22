import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { type AssessmentModule } from '../../lib/db-types.js';

export function InstructorCourseAdminModules({
  resLocals,
  modules,
}: {
  resLocals: Record<string, any>;
  modules: AssessmentModule[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Assessment Modules',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'modules',
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
          <h1>Modules</h1>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Assessment sets">
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Heading</th>
              </tr>
            </thead>
            <tbody>
              ${modules.map(function (module) {
                return html`
                  <tr>
                    <td class="align-middle">${module.number}</td>
                    <td>${module.name}</td>
                    <td class="align-middle">
                      ${AssessmentModuleHeading({ assessment_module: module })}
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
        <div class="card-footer">
          <small>
            Modules can be used to group assessments by topic, chapter, section, or other category.
            More information on modules can be found in the
            <a href="https://prairielearn.readthedocs.io/en/latest/course/#assessment-modules">
              PrairieLearn documentation</a
            >.
          </small>
        </div>
      </div>
    `,
  });
}
