const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');
const z = require('zod');
const _ = require('lodash');

const WorkspaceSchema = z.object({
  id: z.string(),
  state: z.enum(['uninitialized', 'stopped', 'launching', 'running']),
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
  const workspaceHostsTmp = Object.entries(workspacesByHost).map(
    ([workspaceHostId, workspacesForHost]) => {
      // Pick a representative workspace to grab host information from; this
      // should be the same for all workspaces in a group.
      const workspace = workspacesForHost[0];

      return {
        id: workspaceHostId,
        hostname: workspace.workspace_host_hostname,
        instance_id: workspace.workspace_instance_id,
        state: workspace.workspace_host_state,
        workspaces: workspacesForHost,
      };
    }
  );
  const workspaceHosts = workspaceHostsTmp.concat(workspaceHostsTmp);
  console.log(workspaceHosts);
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
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'workspaces',
        })}
        <div id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Workspace hosts</div>
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
          <pre><code>${JSON.stringify(workspacesByHost, null, 2)}</code></pre>
          <pre><code>${JSON.stringify(workspaces, null, 2)}</code></pre>
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
  return html` <span class="badge badge-${color}">${state}</span> `;
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
