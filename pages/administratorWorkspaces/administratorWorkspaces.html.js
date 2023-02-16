const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');
const z = require('zod');
const _ = require('lodash');

const WorkspaceSchema = z.object({
  id: z.string(),
  state: z.enum(['uninitialized', 'stopped', 'launching', 'running']),
  time_in_state: z.string(),
  workspace_host_id: z.string(),
  workspace_host_hostname: z.string().optional(),
  workspace_instance_id: z.string().optional(),
  workspace_host_state: z.enum([
    'launching',
    'ready',
    'draining',
    'unhealthy',
    'terminating',
    'terminated',
  ]),
  workspace_host_time_in_state: z.string(),
});

/** @typedef {z.infer<WorkspaceSchema>} Workspace */

/**
 * @typedef {object} AdministratorWorkspacesProps
 * @property {Workspace[]} workspaces
 * @property {number} workspaceLostHostCapacity
 * @property {Record<string, any>} resLocals
 */

/**
 * @param {AdministratorWorkspacesProps} props
 * @returns {string}
 */
function AdministratorWorkspaces({ workspaces, workspaceLoadHostCapacity, resLocals }) {
  const workspacesByHost = _.groupBy(workspaces, 'workspace_host_id');
  const workspaceHosts = Object.entries(workspacesByHost).map(
    ([workspaceHostId, workspacesForHost]) => {
      // Pick a representative workspace to grab host information from; this
      // should be the same for all workspaces in a group.
      const workspace = workspacesForHost[0];

      return {
        id: workspaceHostId,
        hostname: workspace.workspace_host_hostname,
        instance_id: workspace.workspace_instance_id,
        state: workspace.workspace_host_state,
        time_in_state: workspace.workspace_host_time_in_state,
        workspaces: workspacesForHost,
      };
    }
  );

  return html`
    <!DOCTYPE html>
    <html>
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
        <div id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <span class="mr-auto">Workspace hosts</span>
              <button class="btn btn-light" id="toggle-all-workspaces" data-state="collapsed">
                Expand all
              </button>
            </div>
            <div class="list-group list-group-flush">
              ${workspaceHosts.map((workspaceHost) => {
                const instanceId = workspaceHost.instance_id;
                return html`
                  <div class="list-group-item">
                    <div class="d-flex flex-row flex-wrap align-items-center">
                      <span class="mr-auto pr-2 text-monospace">
                        <a
                          href="workspaces-${workspaceHost.id}"
                          data-target="#workspaces-${workspaceHost.id}"
                          data-toggle="collapse"
                          aria-expanded="false"
                          aria-controls="workspaces-${workspaceHost.id}"
                          >${workspaceHost.hostname}</a
                        >
                        ${instanceId ? html`(<span class="text-muted">${instanceId}</span>)` : null}
                        ${WorkspaceHostState({ state: workspaceHost.state })}
                        <span class="badge badge-secondary"> ${workspaceHost.time_in_state} </span>
                      </span>
                      ${Capacity({
                        total: workspaceLoadHostCapacity,
                        current: workspaceHost.workspaces.length,
                      })}
                    </div>
                    <div id="workspaces-${workspaceHost.id}" class="collapse">
                      <div class="list-group list-group my-2">
                        ${workspaceHost.workspaces.map((workspace) => {
                          return html`
                            <div class="list-group-item d-flex align-items-center">
                              <span class="mr-2" style="font-variant-numeric: tabular-nums;">
                                ${workspace.id}
                              </span>
                              ${WorkspaceState({ state: workspace.state })}
                              <span class="badge badge-secondary">
                                ${workspace.time_in_state}
                              </span>
                            </div>
                          `;
                        })}
                      </div>
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
        </div>
      </body>
    </html>
  `.toString();
}

/**
 * @typedef {Object} CapacityProps
 * @property {number} total
 * @property {number} current
 */

/**
 * @param {CapacityProps} props
 * @returns {import('@prairielearn/html').HtmlSafeString}
 */
function Capacity({ total, current }) {
  const capacity = (current / total) * 100;
  return html`
    <div class="d-flex flex-row align-items-center">
      <div class="text-muted mr-2" style="font-variant-numeric: tabular-nums;">
        ${current} / ${total}
      </div>
      <div class="progress flex-grow-1" style="width: 100px">
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
  return html`<span class="badge badge-${color}">${state}</span>`;
}

module.exports = {
  WorkspaceSchema,
  AdministratorWorkspaces,
};
