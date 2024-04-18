import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag } from '../../lib/assets';

export function Workspace({
  navTitle,
  navTitleHref,
  showLogs,
  heartbeatIntervalSec,
  visibilityTimeoutSec,
  socketToken,
  resLocals,
}: {
  navTitle: string;
  navTitleHref: string;
  showLogs: boolean;
  heartbeatIntervalSec: number;
  visibilityTimeoutSec: number;
  socketToken: string;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en" class="h-100">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
        <link href="${resLocals.asset_path('stylesheets/workspace.css')}" rel="stylesheet" />
        ${compiledScriptTag('workspaceClient.ts')}
      </head>

      <body
        class="d-flex flex-column h-100"
        data-socket-token="${socketToken}"
        data-workspace-id="${resLocals.workspace_id}"
        data-heartbeat-interval-sec="${heartbeatIntervalSec}"
        data-visibility-timeout-sec="${visibilityTimeoutSec}"
      >
        <div
          class="modal fade"
          id="rebootModal"
          tabindex="-1"
          aria-labelledby="rebootModalLabel"
          aria-hidden="true"
        >
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h1 class="h5 modal-title" id="rebootModalLabel">Reboot the workspace</h1>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <p>Are you sure you want to reboot the virtual machine?</p>
                <ul class="fa-ul">
                  <li>
                    <span class="fa-li"><i class="fas fa-save" aria-hidden="true"></i></span>Your
                    files will remain intact through the reboot.
                  </li>
                  <li>
                    <span class="fa-li"
                      ><i class="fas fa-window-restore" aria-hidden="true"></i></span
                    >Your workspace will reboot into this same tab.
                  </li>
                </ul>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button name="__action" value="reboot" class="btn btn-info">
                    <i class="fas fa-sync text-white" aria-hidden="true"></i>
                    Reboot
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <div
          class="modal fade"
          id="resetModal"
          tabindex="-1"
          aria-labelledby="resetModalLabel"
          aria-hidden="true"
        >
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h1 class="h5 modal-title" id="resetModalLabel">Reset the workspace</h1>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <p>Are you sure you want to reset the virtual machine?</p>
                <ul class="fa-ul">
                  <li>
                    <span class="fa-li"
                      ><i
                        class="fas fa-exclamation-triangle text-danger"
                        aria-hidden="true"
                      ></i></span
                    ><strong class="text-danger">Your file changes will be lost!</strong> The
                    workspace will return to its original state upon reset.
                  </li>
                  <li>
                    <span class="fa-li"
                      ><i class="fas fa-window-restore" aria-hidden="true"></i></span
                    >Your workspace will reset into this same tab.
                  </li>
                </ul>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button name="__action" value="reset" class="btn btn-danger">
                    <i class="fas fa-trash text-white" aria-hidden="true"></i>
                    Reset
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <nav
          class="navbar navbar-expand-md navbar-dark bg-info align-items-center"
          style="height:55px"
        >
          <div class="d-flex flex-column mr-3 text-white">
            <span>
              <a href="${navTitleHref}" target="_blank" class="text-white">${navTitle}</a>
            </span>
            <span class="small">
              <i class="fa fa-laptop-code" aria-hidden="true"></i>
              PrairieLearn Workspace
            </span>
          </div>

          <div class="d-flex flex-row ml-auto align-items-center">
            <ul class="navbar-nav flex-row">
              <li class="mr-2">
                <span id="state" class="badge badge-dark badge-workspace text-uppercase"
                  ><i class="fas fa-spinner fa-pulse"></i></span
                ><span
                  id="message"
                  class="badge badge-dark badge-workspace badge-append font-weight-normal"
                ></span>
              </li>
            </ul>
            <button
              class="navbar-toggler"
              type="button"
              data-toggle="collapse"
              data-target="#workspace-nav"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
          </div>

          <div class="collapse navbar-collapse" id="workspace-nav">
            <ul class="navbar-nav ml-auto">
              <li class="d-sm-none nav-item ml-2 my-1">
                <span class="nav-item badge badge-light">${navTitle}</span>
              </li>
              <li class="nav-item ml-2 my-1">
                <button
                  id="reboot"
                  class="nav-item btn btn-light"
                  data-toggle="modal"
                  data-target="#rebootModal"
                >
                  <i class="fas fa-sync text-info" aria-hidden="true"></i>
                  Reboot
                </button>
              </li>
              <li class="nav-item ml-2 my-1">
                <button
                  id="reset"
                  class="nav-item btn btn-light"
                  data-toggle="modal"
                  data-target="#resetModal"
                >
                  <i class="fas fa-trash text-danger" aria-hidden="true"></i>
                  Reset
                </button>
              </li>
              ${showLogs
                ? html`
                    <li class="nav-item ml-2 my-1">
                      <a
                        class="nav-item btn btn-light"
                        href="${resLocals.urlPrefix}/workspace/${resLocals.workspace_id}/logs"
                        target="_blank"
                      >
                        <i class="fas fa-bars-staggered" aria-hidden="true"></i>
                        Logs
                      </a>
                    </li>
                  `
                : null}
              <li class="nav-item ml-2 ml-md-3 my-1">
                <a
                  tabindex="0"
                  type="button"
                  class="nav-item btn btn-light"
                  data-container="body"
                  data-toggle="popover"
                  data-placement="bottom"
                  data-html="true"
                  data-content='<ul class="list-group list-group-flush">
                              <li class="list-group-item p-2"><div class="row"><div class="col col-3 font-weight-bold d-flex align-items-center">Reloading</div><div class="col col-9">Use your browser reload button on this tab at any time, or close and re-open the tab.</div></div></li>
                              <li class="list-group-item p-2"><div class="row"><div class="col col-3 font-weight-bold d-flex align-items-center">Rebooting</div> <div class="col col-9">The <span class="badge badge-outline badge-light"><i class="fas fa-sync" aria-hidden="true"></i> Reboot</span> button will restart the virtual machine. Your files will remain intact.</div></div></li>
                              <li class="list-group-item p-2"><div class="row"><div class="col col-3 font-weight-bold d-flex align-items-center">Resetting</div> <div class="col col-9">The <span class="badge badge-outline badge-light"><i class="fas fa-trash text-secondary" aria-hidden="true"></i> Reset</span> button will delete all of your file edits and revert the virtual machine to its original state.</div></div></li>
                              <li class="list-group-item p-2"><div class="row"><div class="col col-3 font-weight-bold d-flex align-items-center">Saving</div>    <div class="col col-9">Your files are automatically saved.</div></div></li>
                              <li class="list-group-item p-2"><div class="row"><div class="col col-3 font-weight-bold d-flex align-items-center">Grading</div>   <div class="col col-9">Use the <span class="badge badge-outline badge-light">Save &amp; Grade</span> button on the PrairieLearn question page to submit your files for grading.</div></div></li>
                            </ul>'
                >
                  <i class="fas fa-question-circle text-secondary" aria-hidden="true"></i>
                </a>
              </li>
            </ul>
          </div>
        </nav>

        <main class="d-flex flex-column flex-grow h-100">
          <div
            id="loading"
            class="d-flex h-100 flex-grow justify-content-center align-items-center"
          >
            <i class="d-block fa fa-10x fa-circle-notch fa-spin text-info" aria-hidden="true"></i>
            <span class="sr-only">Loading workspace &hellip;</span>
          </div>
          <div
            id="stopped"
            class="d-none h-100 flex-grow flex-column justify-content-center align-items-center"
          >
            <h2>Workspace stopped due to inactivity</h2>
            <p>Your data was automatically saved. Reload the page to restart the workspace.</p>
            <button id="reload" class="btn btn-primary">Reload</button>
          </div>
          <iframe id="workspace" class="d-none flex-grow h-100 border-0"></iframe>
        </main>
      </body>
    </html>
  `.toString();
}
