import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { TagBadge } from '../../components/TagBadge.html.js';
import { type Tag } from '../../lib/db-types.js';

export function InstructorCourseAdminTags({
  resLocals,
  tags,
}: {
  resLocals: Record<string, any>;
  tags: Tag[];
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
              <h1>Tags</h1>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped" aria-label="Tags">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Name</th>
                    <th>Color</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  ${tags.map(
                    (tag) => html`
                      <tr>
                        <td class="align-middle">${tag.number}</td>
                        <td class="align-middle">${TagBadge(tag)}</td>
                        <td class="align-middle">${tag.color}</td>
                        <td class="align-middle">${tag.description}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
