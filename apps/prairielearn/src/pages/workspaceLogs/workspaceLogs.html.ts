import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { WorkspaceLogSchema } from '../../lib/db-types';
import { z } from 'zod';

export const WorkspaceLogRowSchema = WorkspaceLogSchema.extend({
  date_formatted: z.string(),
});
export type WorkspaceLogRow = z.infer<typeof WorkspaceLogRowSchema>;

export function WorkspaceLogs({
  workspaceLogs,
  resLocals,
}: {
  workspaceLogs: WorkspaceLogRow[];
  resLocals: Record<string, any>;
}) {
  // Get the list of unique versions and the date at which they were created.
  // These are ordered by date, so we can use the date of the first log for
  // each version as the version's creation date.
  const knownVersions = new Set();
  const uniqueVersions: { version: string; date_formatted: string }[] = [];
  workspaceLogs.forEach((log) => {
    if (!knownVersions.has(log.version)) {
      knownVersions.add(log.version);
      uniqueVersions.push({
        version: log.version,
        date_formatted: log.date_formatted,
      });
    }
  });

  return html`
    <!doctype html>
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

        <main id="content" class="container">
          <h1 class="mb-4">Workspace logs</h1>

          <h2>Versions</h2>
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
                      <td>${version.date_formatted}</td>
                      <td>
                        <a href="${logsUrl}"> View detailed logs </a>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>

          <h2>History</h2>
          ${WorkspaceLogsTable({ workspaceLogs })}
        </main>
      </body>
    </html>
  `.toString();
}

export function WorkspaceVersionLogs({
  workspaceLogs,
  containerLogs,
  containerLogsEnabled,
  containerLogsExpired,
  resLocals,
}: {
  workspaceLogs: WorkspaceLogRow[];
  containerLogs: string | null;
  containerLogsEnabled: boolean;
  containerLogsExpired: boolean;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Workspace version logs',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'plain',
        })}

        <main id="content" class="container mb-4">
          <h1 class="mb-4">Workspace version logs</h1>

          <h2>Container logs</h2>
          ${containerLogs !== null && containerLogsEnabled && !containerLogsExpired
            ? html`
                <pre class="bg-dark rounded text-white p-3 mb-3"><code>${containerLogs}</code></pre>
              `
            : html`
                <div class="bg-dark py-5 px-2 mb-3 rounded text-white text-center text-monospace">
                  <div class="mb-2">
                    <i
                      class="fa ${containerLogsEnabled && containerLogsExpired
                        ? 'fa-calendar'
                        : 'fa-ban'} fa-2xl"
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div>
                    ${containerLogsEnabled
                      ? 'The container logs for this workspace have expired and are no longer available.'
                      : 'Container logs are not available for this workspace.'}
                  </div>
                </div>
              `}

          <h2>History</h2>
          ${WorkspaceLogsTable({ workspaceLogs, includeVersion: false })}
        </main>
      </body>
    </html>
  `.toString();
}

export function WorkspaceLogsTable({
  workspaceLogs,
  includeVersion = true,
}: {
  workspaceLogs: WorkspaceLogRow[];
  includeVersion?: boolean;
}) {
  return html`
    <div class="table-responsive">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Date</th>
            <th>Message</th>
            <th>State</th>
            ${includeVersion ? html`<th>Version</th>` : ''}
          </tr>
        </thead>

        <tbody>
          ${workspaceLogs.map((log) => {
            return html`
              <tr>
                <td>${log.date_formatted}</td>
                <td>${log.message}</td>
                <td>${log.state}</td>
                ${includeVersion ? html`<td>${log.version}</td>` : ''}
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `;
}
