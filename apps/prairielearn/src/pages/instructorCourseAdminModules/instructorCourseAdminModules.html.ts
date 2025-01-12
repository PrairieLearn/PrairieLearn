import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type AssessmentModule } from '../../lib/db-types.js';

export function InstructorCourseAdminModules({
  resLocals,
  modules,
}: {
  resLocals: Record<string, any>;
  modules: AssessmentModule[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Assessment Modules' })}
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
                        <td>${module.heading}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <small>
                Modules can be used to group assessments by topic, chapter, section, or other
                category. More information on modules can be found in the
                <a href="https://prairielearn.readthedocs.io/en/latest/course/#assessment-modules">
                  PrairieLearn documentation</a
                >.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
