import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

import { WorkspaceHostSchema, IdSchema } from '../../lib/db-types';

const WorkspaceWithContextSchema = z.object({
  id: IdSchema,
  state: z.enum(['uninitialized', 'stopped', 'launching', 'running']),
  time_in_state: z.string(),
  question_name: z.string(),
  course_instance_name: z.string().nullable(),
  course_name: z.string(),
  institution_name: z.string(),
});

export const WorkspaceHostRowSchema = z.object({
  workspace_host: WorkspaceHostSchema,
  workspace_host_time_in_state: z.string(),
  workspaces: z.array(WorkspaceWithContextSchema),
});
type WorkspaceHostRow = z.infer<typeof WorkspaceHostRowSchema>;

export function AdministratorWorkspaces({
  workspaceHostRows,
  workspaceLoadHostCapacity,
  resLocals,
}: {
  workspaceHostRows: WorkspaceHostRow[];
  workspaceLoadHostCapacity: number;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        <script>
          $(() => {
            $('[data-toggle="popover"]').popover({ sanitize: false });
            const toggleButton = document.querySelector('#toggle-all-workspaces');
            toggleButton.addEventListener('click', () => {
              const state = toggleButton.dataset.state;
              $('#content .collapse').collapse(state === 'collapsed' ? 'show' : 'hide');
              toggleButton.dataset.state = state === 'collapsed' ? 'expanded' : 'collapsed';
              toggleButton.textContent = state === 'collapsed' ? 'Collapse all' : 'Expand all';
            });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'workspaces',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <span class="mr-auto">Workspace hosts</span>
              <button class="btn btn-light" id="toggle-all-workspaces" data-state="collapsed">
                Expand all
              </button>
            </div>
            <div class="list-group list-group-flush">
              ${workspaceHostRows.map((workspaceHostRow) => {
                const workspaceHost = workspaceHostRow.workspace_host;
                const workspaces = workspaceHostRow.workspaces;
                const instanceId = workspaceHost.instance_id;
                return html`
                  <div class="list-group-item">
                    <div class="d-flex flex-row flex-wrap align-items-center">
                      <div class="d-flex align-items-center mr-auto pr-2 text-monospace">
                        <a
                          href="workspaces-${workspaceHost.id}"
                          class="mr-2"
                          data-target="#workspaces-${workspaceHost.id}"
                          data-toggle="collapse"
                          aria-expanded="false"
                          aria-controls="workspaces-${workspaceHost.id}"
                          >${workspaceHost.hostname}</a
                        >
                        ${instanceId
                          ? html`<span class="text-muted mr-2">(${instanceId})</span>`
                          : null}
                        ${WorkspaceHostState({ state: workspaceHost.state })}
                        <span class="badge badge-secondary">
                          ${workspaceHostRow.workspace_host_time_in_state}
                        </span>
                      </div>
                      ${Capacity({
                        total: workspaceLoadHostCapacity,
                        current: workspaces.length,
                      })}
                    </div>
                    <div id="workspaces-${workspaceHost.id}" class="collapse">
                      ${workspaces.length === 0
                        ? html`
                            <div class="text-muted my-2">
                              There are no workspaces running on this host.
                            </div>
                          `
                        : html`
                            <div class="list-group list-group my-2">
                              ${workspaces.map((workspace) => {
                                const maybeCourseInstanceName = workspace.course_instance_name
                                  ? html`(<span title="Course instance"
                                        >${workspace.course_instance_name}</span
                                      >)`
                                  : null;
                                return html`
                                  <div class="list-group-item">
                                    <div class="d-flex align-items-center">
                                      <span
                                        class="mr-2"
                                        style="font-variant-numeric: tabular-nums;"
                                      >
                                        ${workspace.id}
                                      </span>
                                      ${WorkspaceState({ state: workspace.state })}
                                      <span class="badge badge-secondary">
                                        ${workspace.time_in_state}
                                      </span>
                                    </div>
                                    <div class="text-muted text-small">
                                      <span class="text-monospace" title="Question"
                                        >${workspace.question_name}</span
                                      >
                                      &bull;
                                      <span title="Course">${workspace.course_name}</span>
                                      ${maybeCourseInstanceName} &bull;
                                      <span title="Institution">${workspace.institution_name}</span>
                                    </div>
                                  </div>
                                `;
                              })}
                            </div>
                          `}
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function Capacity({ total, current }: { total: number; current: number }) {
  const capacity = (current / total) * 100;
  return html`
    <div class="d-flex flex-row align-items-center">
      <div class="text-muted mr-2" style="font-variant-numeric: tabular-nums;">
        ${current} / ${total}
      </div>
      <div
        class="progress flex-grow-1"
        style="width: 100px"
        role="meter"
        aria-label="Host capacity"
        aria-valuemin="0"
        aria-valuemax="${total}"
        aria-valuenow="${current}"
      >
        <div class="progress-bar" style="width: ${capacity}%"></div>
      </div>
    </div>
  `;
}

function WorkspaceState({ state }) {
  const color = state === 'running' ? 'success' : 'secondary';
  return html` <span class="badge badge-${color} mr-2">${state}</span> `;
}

function WorkspaceHostState({ state }) {
  let color = 'secondary';
  switch (state) {
    case 'ready':
      color = 'success';
      break;
    case 'unhealthy':
    case 'terminating':
    case 'terminated':
      color = 'danger';
      break;
  }
  return html`<span class="badge badge-${color} mr-2">${state}</span>`;
}
