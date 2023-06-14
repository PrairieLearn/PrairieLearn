import { Countdown } from './countdown';
import { onDocumentReady, decodeData, parseHTMLElement } from '@prairielearn/browser-utils';

declare global {
  interface Window {
    // Temporary until questionPageScripts is converted to an asset
    allowQuestionUnload: boolean;
  }
}

onDocumentReady(() => {
  // TODO Set type
  const timeLimitData = decodeData('time-limit-data');
  new Countdown(
    '#countdownDisplay',
    '#countdownProgress',
    timeLimitData.serverRemainingMS,
    timeLimitData.serverTimeLimitMS,
    timeLimitData.serverUpdateURL,
    () => {
      // if viewing exam as a different effective user, do not trigger time limit finish
      if (timeLimitData.canTriggerFinish) {
        // do not trigger unsaved warning dialog
        window.allowQuestionUnload = true;
        const form = parseHTMLElement(
          document,
          `<form method="POST">
            <input type="hidden" name="__action" value="timeLimitFinish" />
            <input type="hidden" name="__csrf_token" value="${timeLimitData.csrfToken}" />
          </form>`
        );
        document.body.append(form);
        form.submit();
      }
    },
    () => {
      // On time limit fail, reload the page
      window.location.reload();
    },
    (remainingSec) => {
      if (remainingSec >= 180) {
        return 'bg-primary';
      } else if (remainingSec >= 60) {
        return 'bg-warning';
      } else {
        return 'bg-danger';
      }
    }
  );
});
