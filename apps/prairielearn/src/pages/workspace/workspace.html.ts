import { escapeHtml, html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { assetPath, compiledScriptTag } from '../../lib/assets.js';

export function Workspace({
  pageTitle,
  pageNote,
  navTitle,
  navTitleHref,
  showLogs,
  heartbeatIntervalSec,
  visibilityTimeoutSec,
  socketToken,
  resLocals,
}: {
  pageTitle?: string;
  pageNote?: string;
  navTitle: string;
  navTitleHref: string;
  showLogs: boolean;
  heartbeatIntervalSec: number;
  visibilityTimeoutSec: number;
  socketToken: string;
  resLocals: Record<string, any>;
}) {
  const { workspace_id, urlPrefix, __csrf_token } = resLocals;
  return html`
    <!doctype html>
    <html lang="en" class="h-100">
      <head>
        ${HeadContents({ resLocals, pageNote, pageTitle })}
        <link href="${assetPath('stylesheets/workspace.css')}" rel="stylesheet" />
        ${compiledScriptTag('workspaceClient.ts')}
      </head>

      <body
        class="d-flex flex-column h-100"
        data-socket-token="${socketToken}"
        data-workspace-id="${workspace_id}"
        data-heartbeat-interval-sec="${heartbeatIntervalSec}"
        data-visibility-timeout-sec="${visibilityTimeoutSec}"
      >
        ${RebootModal({ __csrf_token })} ${ResetModal({ __csrf_token })}

        <nav
          class="navbar navbar-expand-md navbar-dark bg-info align-items-center"
          style="height:55px"
        >
          <div class="d-flex flex-column mr-3 text-white">
            <span>
              <h1 class="h6 font-weight-normal mb-0">
                <a href="${navTitleHref}" target="_blank" class="text-white">${navTitle}</a>
              </h1>
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
                        href="${urlPrefix}/workspace/${workspace_id}/logs"
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
                  data-toggle="popover"
                  data-trigger="focus"
                  data-container="body"
                  data-placement="bottom"
                  data-html="true"
                  data-content="${escapeHtml(HelpButtonContents())}"
                >
                  <i class="fas fa-question-circle text-secondary" aria-hidden="true"></i>
                </a>
              </li>
            </ul>
          </div>
        </nav>

        <main id="content" class="d-flex flex-column flex-grow h-100">
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

function ResetModal({ __csrf_token }: { __csrf_token: string }) {
  return Modal({
    id: 'resetModal',
    title: 'Reset the workspace',
    body: html`
      <p>Are you sure you want to reset the virtual machine?</p>
      <ul class="fa-ul">
        <li>
          <span class="fa-li">
            <i class="fas fa-exclamation-triangle text-danger" aria-hidden="true"></i>
          </span>
          <strong class="text-danger">Your file changes will be lost!</strong> The workspace will
          return to its original state upon reset.
        </li>
        <li>
          <span class="fa-li"><i class="fas fa-window-restore" aria-hidden="true"></i></span>
          Your workspace will reset into this same tab.
        </li>
      </ul>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button name="__action" value="reset" class="btn btn-danger">
        <i class="fas fa-trash text-white" aria-hidden="true"></i>
        Reset
      </button>
    `,
  });
}

function RebootModal({ __csrf_token }: { __csrf_token: string }) {
  return Modal({
    id: 'rebootModal',
    title: 'Reboot the workspace',
    body: html`
      <p>Are you sure you want to reboot the virtual machine?</p>
      <ul class="fa-ul">
        <li>
          <span class="fa-li"><i class="fas fa-save" aria-hidden="true"></i></span> Your files will
          remain intact through the reboot.
        </li>
        <li>
          <span class="fa-li"><i class="fas fa-window-restore" aria-hidden="true"></i></span> Your
          workspace will reboot into this same tab.
        </li>
      </ul>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button name="__action" value="reboot" class="btn btn-info">
        <i class="fas fa-sync text-white" aria-hidden="true"></i>
        Reboot
      </button>
    `,
  });
}

function HelpButtonContents() {
  return html`
    <ul class="list-group list-group-flush">
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 font-weight-bold d-flex align-items-center">Reloading</div>
          <div class="col col-9">
            Use your browser reload button on this tab at any time, or close and re-open the tab.
          </div>
        </div>
      </li>
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 font-weight-bold d-flex align-items-center">Rebooting</div>
          <div class="col col-9">
            The
            <span class="badge badge-outline badge-light">
              <i class="fas fa-sync" aria-hidden="true"></i> Reboot
            </span>
            button will restart the virtual machine. Your files will remain intact.
          </div>
        </div>
      </li>
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 font-weight-bold d-flex align-items-center">Resetting</div>
          <div class="col col-9">
            The
            <span class="badge badge-outline badge-light">
              <i class="fas fa-trash text-secondary" aria-hidden="true"></i> Reset
            </span>
            button will delete all of your file edits and revert the virtual machine to its original
            state.
          </div>
        </div>
      </li>
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 font-weight-bold d-flex align-items-center">Grading</div>
          <div class="col col-9">
            Use the <span class="badge badge-outline badge-light">Save &amp; Grade</span> button on
            the PrairieLearn question page to submit your files for grading.
          </div>
        </div>
      </li>
    </ul>
  `;
}
