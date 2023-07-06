import { setupCountdown } from './lib/countdown';
import { saveQuestionFormData } from './lib/confirmOnUnload';
import { onDocumentReady, decodeData, parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

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
      // if viewing exam as a different effective user, do not trigger time limit finish
      if (timeLimitData.canTriggerFinish) {
        // do not trigger unsaved warning dialog
        saveQuestionFormData(document.querySelector('form.question-form'));
        const form = parseHTMLElement(
          document,
          html`<form method="POST">
            <input type="hidden" name="__action" value="timeLimitFinish" />
            <input type="hidden" name="__csrf_token" value="${timeLimitData.csrfToken}" />
          </form>`,
        ) as HTMLFormElement;
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
