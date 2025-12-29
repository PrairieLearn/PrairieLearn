import { html } from '@prairielearn/html';

import { AssessmentModuleHeadingHtml } from '../../components/AssessmentModuleHeading.js';
import { PageLayout } from '../../components/PageLayout.js';
import { type AssessmentModule } from '../../lib/db-types.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export function InstructorCourseAdminModules({
  resLocals,
  modules,
}: {
  resLocals: UntypedResLocals;
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
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>Modules</h1>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Assessment sets">
            <thead>
              <tr>
                <th>Name</th>
                <th>Heading</th>
              </tr>
            </thead>
            <tbody>
              ${modules.map(function (module) {
                return html`
                  <tr>
                    <td>${module.name}</td>
                    <td class="align-middle">
                      ${AssessmentModuleHeadingHtml({ assessment_module: module })}
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
