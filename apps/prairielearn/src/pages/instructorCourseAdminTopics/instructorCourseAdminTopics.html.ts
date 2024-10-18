import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { type Topic } from '../../lib/db-types.js';

export function InstructorCourseAdminTopics({
  resLocals,
  topics,
}: {
  resLocals: Record<string, any>;
  topics: Topic[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
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
              <h1>Topics</h1>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped" aria-label="Topics">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Name</th>
                    <th>Color</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  ${topics.map(function (topic) {
                    return html`
                      <tr>
                        <td class="align-middle">${topic.number}</td>
                        <td class="align-middle">${TopicBadge(topic)}</td>
                        <td class="align-middle">${topic.color}</td>
                        <td class="align-middle">${topic.description}</td>
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
