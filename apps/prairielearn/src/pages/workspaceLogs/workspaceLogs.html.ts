import { z } from 'zod';

import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { WorkspaceLogSchema } from '../../lib/db-types.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export const WorkspaceLogRowSchema = WorkspaceLogSchema.extend({
  date_formatted: z.string(),
});
export type WorkspaceLogRow = z.infer<typeof WorkspaceLogRowSchema>;

export function WorkspaceLogs({
  workspaceLogs,
  resLocals,
}: {
  workspaceLogs: WorkspaceLogRow[];
  resLocals: UntypedResLocals;
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

  return PageLayout({
    resLocals,
    pageTitle: 'Workspace logs',
    navContext: {
      page: 'workspace',
      type: 'plain',
    },
    content: html`
      <h1 class="mb-4">Workspace logs</h1>
      <h2>Versions</h2>
      <div class="table-responsive">
        <table class="table table-sm" aria-label="Workspace versions">
          <thead>
            <tr>
              <th>Version</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
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
    `,
  });
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
  resLocals: UntypedResLocals;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Workspace version logs',
    navContext: {
      page: 'workspace',
      type: 'plain',
    },
    content: html`
      <h1 class="mb-4">Workspace version logs</h1>

      <h2>Container logs</h2>
      ${containerLogs !== null && containerLogsEnabled && !containerLogsExpired
        ? html`
            <pre class="bg-dark rounded text-white p-3 mb-3"><code>${containerLogs}</code></pre>
          `
        : html`
            <div class="bg-dark py-5 px-2 mb-3 rounded text-white text-center font-monospace">
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
    `,
  });
}

function WorkspaceLogsTable({
  workspaceLogs,
  includeVersion = true,
}: {
  workspaceLogs: WorkspaceLogRow[];
  includeVersion?: boolean;
}) {
  return html`
    <div class="table-responsive">
      <table class="table table-sm" aria-label="Workspace logs">
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
