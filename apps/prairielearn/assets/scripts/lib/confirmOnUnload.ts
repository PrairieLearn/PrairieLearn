import { initializeQuestionFormState, isQuestionFormDirty } from './questionForm.js';

let skipNextConfirmation = false;

/**
 * Disables the "unsaved changes" confirmation for the next page unload.
 * Call this immediately before intentionally navigating away (e.g., form submission).
 *
 * The flag auto-resets when the `beforeunload` event fires, so:
 * - If navigation succeeds: page unloads, flag doesn't matter
 * - If navigation is cancelled: flag is reset, subsequent attempts show confirmation
 * - If called without navigation: the next unload will skip confirmation once
 */
export function skipNextFormConfirmation(): void {
  skipNextConfirmation = true;
}

export function confirmOnUnload(form: HTMLFormElement): () => void {
  const cleanupFormState = initializeQuestionFormState(form);

  // Check form state on unload
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    // Skip confirmation if explicitly requested (e.g., during intentional form submission)
    if (skipNextConfirmation) {
      skipNextConfirmation = false; // Reset in case navigation doesn't happen
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
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
