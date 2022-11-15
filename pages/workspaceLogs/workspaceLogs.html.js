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
          viewType: 'instructor',
        })}

        <div id="content" class="container">
          <h1 class="mb-4">Workspace logs</h1>

          <div class="card mb-4">
            <div class="card-body">
              <pre><code>${JSON.stringify(workspaceLogs, null, 2)}</code></pre>
            </div>
          </div>
        </div>
      </body>
    </html>
  `.toString();
};

module.exports.WorkspaceLogs = WorkspaceLogs;
