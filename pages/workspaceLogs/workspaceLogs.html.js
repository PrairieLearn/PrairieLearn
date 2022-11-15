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
    <html lang="en">
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

const WorkspaceVersionLogs = ({ version, workspaceLogs, resLocals }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
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

        <div id="content" class="container mb-4">
          <h1 class="mb-4">Workspace logs</h1>

          <div
            id="js-container-logs"
            class="bg-dark p-3"
            data-logs-endpoint="${resLocals.urlPrefix}/workspace/${resLocals.workspace_id}/logs/version/${version}/container_logs"
          >
            <pre class="text-white rounded mb-3"><code></code></pre>
            <button type="button" class="btn btn-primary js-load-more-logs">Load more logs</button>
          </div>

          ${WorkspaceLogsTable({ workspaceLogs })}
        </div>

        <script>
          $(() => {
            const containerLogs = document.querySelector('#js-container-logs');
            const containerLogsOutput = containerLogs.querySelector('code');
            const loadMoreLogsButton = containerLogs.querySelector('.js-load-more-logs');

            const logsEndpoint = containerLogs.getAttribute('data-logs-endpoint');
            let startAfter = null;

            async function fetchNextLogs() {
              let url = logsEndpoint;
              if (startAfter) {
                url += '?' + new URLSearchParams({ start_after: startAfter });
              }
              const res = await fetch(url);
              if (!res.ok) {
                // TODO: better error handling
                console.error('Error fetching logs', await res.text());
              } else {
                const logs = await res.text();
                console.log(logs);
                containerLogsOutput.appendChild(document.createTextNode(logs));

                if (res.headers.has('x-next-start-after')) {
                  startAfter = res.headers.get('x-next-start-after');
                  console.log('starting after', startAfter);
                }
              }
            }

            // On page load, immediately load the first chunk of logs.
            fetchNextLogs();

            // When the user clicks the "Load more logs" button, load the next chunk of logs.
            loadMoreLogsButton.addEventListener('click', () => {
              // Disable the button so that we can't load more than one chunk at a time.
              loadMoreLogsButton.disabled = true;
              fetchNextLogs().finally(() => {
                loadMoreLogsButton.disabled = false;
              });
            });
          });
        </script>
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
