import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';

export function InstructorCourseAdminOnboarding({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Onboarding Tasklist' })}
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
              <h1>Onboarding Tasks</h1>
            </div>
            <div class="my-4 card-body text-left" style="text-wrap: balance;">
              <p class="font-weight-bold">Complete course setup</p>
              <p class="mb-0">
                Here are some task suggestions to help you finish setting up your course.
              </p>
              <div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
