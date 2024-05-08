import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Topic } from '../../lib/db-types';

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
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Topics</div>
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
                  ${topics.map(function (topic) {
                    return html`
                      <tr>
                        <td class="align-middle">${topic.number}</td>
                        <td class="align-middle">
                          ${renderEjs(__filename, "<%- include('../partials/topic'); %>", {
                            topic,
                          })}
                        </td>
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
