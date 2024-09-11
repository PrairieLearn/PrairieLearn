import { onDocumentReady, decodeData, parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { saveQuestionFormData } from './lib/confirmOnUnload.js';
import { setupCountdown } from './lib/countdown.js';

function showWarningPopup(id: string, message: string) {
  let popup = document.querySelector('#warning-popup');
  if (!popup) {
    popup = parseHTMLElement<HTMLDivElement>(
      document,
      html`<div
        id="warning-popup"
        class="fixed-bottom d-flex flex-column align-items-center mb-5"
      ></div>`,
    );
    document.body.append(popup);
  }
  // Only show one popup with the same ID at the same time
  if (!document.querySelector('#popup-' + id)) {
    popup.appendChild(
      parseHTMLElement<HTMLDivElement>(
        document,
        html`<div
          id="popup-${id}"
          class="show align-items-center alert alert-warning alert-dismissible pulse"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <div>${message}</div>
          <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>`,
      ),
    );
  }
}

onDocumentReady(() => {
  const timeLimitData = decodeData<{
    serverRemainingMS: number;
    serverTimeLimitMS: number;
    serverUpdateURL: string;
    canTriggerFinish: boolean;
    showsTimeoutWarning: boolean;
    reloadOnFail: boolean;
    csrfToken: string;
  }>('time-limit-data');
  setupCountdown({
    displaySelector: '#countdownDisplay',
    progressSelector: '#countdownProgress',
    initialServerRemainingMS: timeLimitData.serverRemainingMS,
    initialServerTimeLimitMS: timeLimitData.serverTimeLimitMS,
    serverUpdateURL: timeLimitData.serverUpdateURL,
    onTimerOut: () => {
      const countdown = document.querySelector('#countdownDisplay');
      if (countdown) countdown.innerHTML = 'expired';
      // if viewing exam as a different effective user, do not trigger time limit finish
      if (timeLimitData.canTriggerFinish) {
        // do not trigger unsaved warning dialog
        saveQuestionFormData(document.querySelector('form.question-form'));
        const form = parseHTMLElement<HTMLFormElement>(
          document,
          html`<form method="POST">
            <input type="hidden" name="__action" value="timeLimitFinish" />
            <input type="hidden" name="__csrf_token" value="${timeLimitData.csrfToken}" />
          </form>`,
        );
        document.body.append(form);
        form.submit();
      }
    },
    onRemainingTime: {
      60000: () => {
        if (timeLimitData.showsTimeoutWarning) {
          showWarningPopup(
            'examTimeout',
            'Your exam is ending soon. Please finish and submit your work.',
          );
        }
      },
    },
    onServerUpdateFail: (remainingMS: number) => {
      // On time limit fail, reload the page
      if (timeLimitData.reloadOnFail) {
        window.location.reload();
      } else {
        // Once the exam access period finishes, we expect updates of the remaining time
        // to fail, so we only show a warning popup if time hasn't yet expired.
        if (remainingMS > 0) {
          showWarningPopup(
            'updateFail',
            'Failed to refresh exam timer. The displayed remaining time might be inaccurate.',
          );
        }
      }
    },
    getBackgroundColor: (remainingSec) => {
      if (remainingSec >= 180) {
        return 'bg-primary';
      } else if (remainingSec >= 60) {
        return 'bg-warning';
      } else {
        return 'bg-danger';
      }
    },
  });
});
