import { onDocumentReady } from '@prairielearn/browser-utils';

// TODO: remove after testing.
import './lib/morphdom';

onDocumentReady(() => {
  document.querySelectorAll('.js-plan').forEach((plan) => {
    const enabledCheckbox = plan.querySelector<HTMLInputElement>('.js-plan-enabled');
    const enabledType = plan.querySelector<HTMLSelectElement>('.js-plan-type');

    if (!enabledCheckbox || !enabledType) return;

    enabledCheckbox.addEventListener('change', () => {
      enabledType.disabled = !enabledCheckbox.checked;
    });
  });
});
