/**
 * Disables the "unsaved changes" confirmation for the next page unload.
 * Call this immediately before intentionally navigating away (e.g., form submission).
 * The document holds the flag so independently built client bundles share it.
 *
 * The flag auto-resets when the `beforeunload` event fires, so:
 * - If navigation succeeds: page unloads, flag doesn't matter
 * - If navigation is cancelled: flag is reset, subsequent attempts show confirmation
 * - If called without navigation: the next unload will skip confirmation once
 */
export function skipNextFormConfirmation(): void {
  document.documentElement.dataset.skipNextFormConfirmation = 'true';
}

export function consumeSkipNextFormConfirmation(): boolean {
  const skip = document.documentElement.dataset.skipNextFormConfirmation === 'true';
  delete document.documentElement.dataset.skipNextFormConfirmation;
  return skip;
}
