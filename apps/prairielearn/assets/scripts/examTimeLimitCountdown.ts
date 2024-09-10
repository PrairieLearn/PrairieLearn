import { onDocumentReady, decodeData, parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { saveQuestionFormData } from './lib/confirmOnUnload.js';
import { setupCountdown } from './lib/countdown.js';

onDocumentReady(() => {
  const timeLimitData = decodeData<{
    serverRemainingMS: number;
    serverTimeLimitMS: number;
    serverUpdateURL: string;
    canTriggerFinish: boolean;
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
    onServerUpdateFail: () => {
      // On time limit fail, reload the page
      window.location.reload();
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
