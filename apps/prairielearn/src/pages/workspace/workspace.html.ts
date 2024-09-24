import { EncodedData } from '@prairielearn/browser-utils';
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
        ${resLocals.assessment?.type === 'Exam' && resLocals.assessment_instance_remaining_ms
          ? html`${compiledScriptTag('examTimeLimitCountdown.ts')}
            ${EncodedData(
              {
                serverRemainingMS: resLocals.assessment_instance_remaining_ms,
                serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
                serverUpdateURL: `${resLocals.plainUrlPrefix}/course_instance/${resLocals.course_instance_id}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
                canTriggerFinish: false,
                showsTimeoutWarning: true,
                reloadOnFail: false,
                csrfToken: resLocals.__csrf_token,
              },
              'time-limit-data',
            )}`
          : ''}
      </head>

      <body
        class="d-flex flex-column h-100"
        data-socket-token="${socketToken}"
        data-workspace-id="${workspace_id}"
        data-heartbeat-interval-sec="${heartbeatIntervalSec}"
        data-visibility-timeout-sec="${visibilityTimeoutSec}"
      >
        ${RebootModal({ __csrf_token })} ${ResetModal({ __csrf_token })}

        <nav class="navbar navbar-light navbar-expand-lg bg-info align-items-center">
          <div class="container-fluid">
            <div class="d-flex flex-column mr-3">
              <h1 class="h6 font-weight-normal mb-0">
                <a href="${navTitleHref}" target="_blank" style="color: #000;">${navTitle}</a>
              </h1>
              <span class="small" style="color: #000;">
                <i class="fa fa-laptop-code" aria-hidden="true"></i>
                PrairieLearn Workspace
              </span>
            </div>

            <div class="d-flex flex-row mr-auto align-items-center">
              <span id="state" class="badge badge-dark badge-workspace text-uppercase">
                <i class="fas fa-spinner fa-pulse"></i>
              </span>
              <span
                id="message"
                class="badge badge-dark badge-workspace badge-append font-weight-normal"
              ></span>
            </div>
            <button
              class="navbar-toggler ml-2"
              type="button"
              data-toggle="collapse"
              data-target="#workspace-nav"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="workspace-nav">
              <ul class="navbar-nav ml-auto">
                ${resLocals.assessment?.type === 'Exam' &&
                resLocals.assessment_instance_remaining_ms
                  ? html` <li class="nav-item ml-2 my-1">
                      <div id="countdownProgress"></div>
                      <div class="text-white small">
                        Time remaining: <span id="countdownDisplay"></span>
                      </div>
                    </li>`
                  : ''}
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
                  <button
                    type="button"
                    class="nav-item btn btn-light"
                    data-toggle="popover"
                    data-container="body"
                    data-placement="bottom"
                    data-html="true"
                    data-content="${escapeHtml(HelpButtonContents())}"
                  >
                    <i class="fas fa-question-circle text-secondary" aria-hidden="true"></i>
                  </button>
                </li>
              </ul>
            </div>
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
        <i class="fas fa-trash" aria-hidden="true"></i>
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
        <i class="fas fa-sync" aria-hidden="true"></i>
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
