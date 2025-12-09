import { EncodedData } from '@prairielearn/browser-utils';
import { escapeHtml, html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { assetPath, compiledScriptTag } from '../../lib/assets.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

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
  resLocals: UntypedResLocals;
}) {
  const { workspace_id, urlPrefix, __csrf_token } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: pageTitle || 'Workspace',
    navContext: {
      type: 'plain',
      page: 'workspace',
    },
    options: {
      fullWidth: true,
      pageNote,
      fullHeight: true,
      dataAttributes: {
        'socket-token': socketToken,
        'workspace-id': workspace_id,
        'heartbeat-interval-sec': heartbeatIntervalSec.toString(),
        'visibility-timeout-sec': visibilityTimeoutSec.toString(),
      },
      enableNavbar: false,
      contentPadding: false,
    },
    headContent: html`
      <link href="${assetPath('stylesheets/workspace.css')}" rel="stylesheet" />
      ${compiledScriptTag('workspaceClient.ts')}
      ${resLocals.assessment?.type === 'Exam' && resLocals.assessment_instance_remaining_ms
        ? html`${compiledScriptTag('examTimeLimitCountdown.ts')}
          ${EncodedData(
            {
              serverRemainingMS: resLocals.assessment_instance_remaining_ms,
              serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
              serverUpdateURL: `/pl/course_instance/${resLocals.course_instance.id}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
              canTriggerFinish: false,
              showsTimeoutWarning: true,
              reloadOnFail: false,
              csrfToken: resLocals.__csrf_token,
            },
            'time-limit-data',
          )}`
        : ''}
    `,
    preContent: html`
      ${RebootModal({ __csrf_token })} ${ResetModal({ __csrf_token })}
      <nav class="navbar navbar-light navbar-expand-lg bg-info align-items-center">
        <div class="container-fluid">
          <div class="d-flex flex-column me-3">
            <h1 class="h6 fw-normal mb-0">
              <a href="${navTitleHref}" target="_blank" style="color: #000;">${navTitle}</a>
            </h1>
            <span class="small" style="color: #000;">
              <i class="fa fa-laptop-code" aria-hidden="true"></i>
              PrairieLearn Workspace
            </span>
          </div>

          <div class="d-flex flex-row me-auto align-items-center">
            <span id="state" class="badge text-bg-dark badge-workspace text-uppercase">
              <i class="fas fa-spinner fa-pulse"></i>
            </span>
            <span
              id="message"
              class="badge text-bg-dark badge-workspace badge-append fw-normal"
            ></span>
          </div>
          <button
            class="navbar-toggler ms-2"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#workspace-nav"
          >
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="workspace-nav">
            <ul class="navbar-nav ms-auto">
              ${resLocals.assessment?.type === 'Exam' && resLocals.assessment_instance_remaining_ms
                ? html` <li class="nav-item ms-2 my-1">
                    <div id="countdownProgress"></div>
                    <div class="text-white small">
                      Time remaining: <span id="countdownDisplay"></span>
                    </div>
                  </li>`
                : ''}
              <li class="nav-item ms-2 my-1">
                <button
                  id="reboot"
                  class="nav-item btn btn-light"
                  data-bs-toggle="modal"
                  data-bs-target="#rebootModal"
                >
                  <i class="fas fa-sync text-info" aria-hidden="true"></i>
                  Reboot
                </button>
              </li>
              <li class="nav-item ms-2 my-1">
                <button
                  id="reset"
                  class="nav-item btn btn-light"
                  data-bs-toggle="modal"
                  data-bs-target="#resetModal"
                >
                  <i class="fas fa-trash text-danger" aria-hidden="true"></i>
                  Reset
                </button>
              </li>
              ${showLogs
                ? html`
                    <li class="nav-item ms-2 my-1">
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
              <li class="nav-item ms-2 ms-md-3 my-1">
                <button
                  type="button"
                  class="nav-item btn btn-light"
                  data-bs-toggle="popover"
                  data-bs-container="body"
                  data-bs-placement="bottom"
                  data-bs-html="true"
                  data-bs-content="${escapeHtml(HelpButtonContents())}"
                >
                  <i class="fas fa-question-circle text-secondary" aria-hidden="true"></i>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    `,
    content: html`
      <div id="loading" class="d-flex h-100 flex-grow justify-content-center align-items-center">
        <i class="d-block fa fa-10x fa-circle-notch fa-spin text-info" aria-hidden="true"></i>
        <span class="visually-hidden">Loading workspace &hellip;</span>
      </div>
      <div
        id="stopped"
        class="d-none h-100 flex-grow flex-column justify-content-center align-items-center p-2 text-center"
      >
        <h2>Workspace stopped due to inactivity</h2>
        <p>Your data was automatically saved. Reload the page to restart the workspace.</p>
        <button id="reload" class="btn btn-primary">Reload</button>
      </div>
      <div
        id="failed"
        class="d-none h-100 flex-grow flex-column justify-content-center align-items-center p-2 text-center"
      >
        <i class="d-block fa fa-10x fa-xmark text-danger" aria-hidden="true"></i>
        <h2>Workspace failed to load</h2>
        <p id="failed-message"></p>
      </div>
      <iframe
        id="workspace"
        class="d-none flex-grow h-100 w-100 border-0"
        title="Workspace"
      ></iframe>
    `,
  });
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
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
          <div class="col col-3 fw-bold d-flex align-items-center">Reloading</div>
          <div class="col col-9">
            Use your browser reload button on this tab at any time, or close and re-open the tab.
          </div>
        </div>
      </li>
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 fw-bold d-flex align-items-center">Rebooting</div>
          <div class="col col-9">
            The
            <span class="badge badge-outline text-bg-light">
              <i class="fas fa-sync" aria-hidden="true"></i> Reboot
            </span>
            button will restart the virtual machine. Your files will remain intact.
          </div>
        </div>
      </li>
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 fw-bold d-flex align-items-center">Resetting</div>
          <div class="col col-9">
            The
            <span class="badge badge-outline text-bg-light">
              <i class="fas fa-trash text-secondary" aria-hidden="true"></i> Reset
            </span>
            button will delete all of your file edits and revert the virtual machine to its original
            state.
          </div>
        </div>
      </li>
      <li class="list-group-item p-2">
        <div class="row">
          <div class="col col-3 fw-bold d-flex align-items-center">Grading</div>
          <div class="col col-9">
            Use the <span class="badge badge-outline text-bg-light">Save &amp; Grade</span> button
            on the PrairieLearn question page to submit your files for grading.
          </div>
        </div>
      </li>
    </ul>
  `;
}
