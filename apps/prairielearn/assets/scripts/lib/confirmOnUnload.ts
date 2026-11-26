import { consumeSkipNextFormConfirmation } from '../../../src/lib/client/confirm-on-unload.js';

import { initializeQuestionFormState, isQuestionFormDirty } from './questionForm.js';

export function confirmOnUnload(form: HTMLFormElement): () => void {
  const cleanupFormState = initializeQuestionFormState(form);
  let pendingSubmission: Event | undefined;

  const handleSubmit = (event: SubmitEvent) => {
    if (event.isTrusted) pendingSubmission = event;
  };
  // Legacy Calculation clients call form.submit() through jQuery, bypassing submit events.
  const handleClick = (event: MouseEvent) => {
    if (!event.isTrusted || !form.querySelector('input.postData')) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button.question-save, button.question-grade')) {
      pendingSubmission = event;
    }
  };
  const resetSubmission = () => {
    pendingSubmission = undefined;
  };
  form.addEventListener('submit', handleSubmit, true);
  form.addEventListener('click', handleClick, true);
  form.addEventListener('input', resetSubmission);
  form.addEventListener('change', resetSubmission);
  window.addEventListener('pageshow', resetSubmission);

  // Check form state on unload
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    // Keep the accepted baseline intact until a successful response replaces the form.
    // Inspect the event here so later handlers can still cancel an attempted submission.
    const submitting = pendingSubmission && !pendingSubmission.defaultPrevented;
    resetSubmission();
    // Skip confirmation if explicitly requested (e.g., during intentional form submission)
    if (consumeSkipNextFormConfirmation() || submitting) {
      return;
    }

    if (isQuestionFormDirty(form)) {
      // Best practice per MDN is to call preventDefault() and set returnValue for legacy support.
      // Safari on iOS does not support confirmation on beforeunload at all.
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#usage_notes
      event.returnValue = 'prompt';
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    cleanupFormState();
    form.removeEventListener('submit', handleSubmit, true);
    form.removeEventListener('click', handleClick, true);
    form.removeEventListener('input', resetSubmission);
    form.removeEventListener('change', resetSubmission);
    window.removeEventListener('pageshow', resetSubmission);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
