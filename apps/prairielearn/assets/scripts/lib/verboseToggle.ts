import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.querySelectorAll<HTMLInputElement>('.js-toggle-verbose').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const targetOutput = document.getElementById(checkbox.getAttribute('data-target-id') ?? '');
      if (targetOutput) {
        targetOutput.style.setProperty('--verbose-display', checkbox.checked ? '' : 'none');
      }
    });
  });
});
