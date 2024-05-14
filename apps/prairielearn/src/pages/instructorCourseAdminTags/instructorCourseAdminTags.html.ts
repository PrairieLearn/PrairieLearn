import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Tag } from '../../lib/db-types.js';

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
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
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
            <div class="card-header bg-primary text-white">Tags</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Name</th>
                    <th>Color</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  ${tags.map(function (tag) {
                    return html`
                      <tr>
                        <td class="align-middle">${tag.number}</td>
                        <td class="align-middle">
                          ${renderEjs(import.meta.url, "<%- include('../partials/tag'); %>", {
                            tag,
                          })}
                        </td>
                        <td class="align-middle">${tag.color}</td>
                        <td class="align-middle">${tag.description}</td>
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
