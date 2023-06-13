import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.querySelectorAll('.js-plan').forEach((plan) => {
    const enabledCheckbox = plan.querySelector<HTMLInputElement>('.js-plan-enabled');
    const enabledType = plan.querySelector<HTMLSelectElement>('.js-plan-type');
    enabledCheckbox.addEventListener('change', () => {
      enabledType.disabled = !enabledCheckbox.checked;
    });
  });
});
