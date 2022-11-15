// @ts-check
const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const WorkspaceLogs = ({ workspaceLogs, resLocals }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en" class="h-100">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Workspace logs',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'plain',
        })}

        <div id="content" class="container">
          <h1 class="mb-4">Workspace logs</h1>

          <table class="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Message</th>
                <th>State</th>
                <th>Version</th>
              </tr>
            </thead>

            <tbody>
              ${workspaceLogs.map((log) => {
                return html`
                  <tr>
                    <td>${log.date}</td>
                    <td>${log.message}</td>
                    <td>${log.state}</td>
                    <td>${log.version}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `.toString();
};

module.exports.WorkspaceLogs = WorkspaceLogs;
