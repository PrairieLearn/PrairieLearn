import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const termsCheckbox = document.querySelector<HTMLInputElement>('#js-terms-agreement');
  const submitButton = document.querySelector<HTMLButtonElement>('#js-upgrade');

  if (!termsCheckbox || !submitButton) return;

  termsCheckbox.addEventListener('change', () => {
    submitButton.disabled = !termsCheckbox.checked;
  });
});
