// @ts-check
const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const WorkspaceLogs = ({ workspaceLogs, resLocals }) => {
  // Get the list of unique versions and the date at which they were created.
  // These are ordered by date, so we can use the date of the first log for
  // each version as the version's creation date.
  const knownVersions = new Set();
  const uniqueVersions = [];
  workspaceLogs.forEach((log) => {
    if (!knownVersions.has(log.version)) {
      knownVersions.add(log.version);
      uniqueVersions.push({ version: log.version, date: log.date });
    }
  });

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

          <div class="table-responsive">
            <table class="table table-sm">
              <thead>
                <th>Version</th>
                <th>Created</th>
                <th>Actions</th>
              </thead>
              <tbody>
                ${uniqueVersions.map((version) => {
                  const logsUrl = `${resLocals.urlPrefix}/workspace/${resLocals.workspace_id}/logs/version/${version.version}`;
                  return html`
                    <tr>
                      <td>${version.version}</td>
                      <td>${version.date}</td>
                      <td>
                        <a href="${logsUrl}"> View detailed logs </a>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>

          ${WorkspaceLogsTable({ workspaceLogs })}
        </div>
      </body>
    </html>
  `.toString();
};

const WorkspaceVersionLogs = ({ workspaceLogs, resLocals }) => {
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

          ${WorkspaceLogsTable({ workspaceLogs })}
        </div>
      </body>
    </html>
  `.toString();
};

const WorkspaceLogsTable = ({ workspaceLogs }) => {
  return html`
    <div class="table-responsive">
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
  `;
};

module.exports.WorkspaceLogs = WorkspaceLogs;
module.exports.WorkspaceVersionLogs = WorkspaceVersionLogs;
