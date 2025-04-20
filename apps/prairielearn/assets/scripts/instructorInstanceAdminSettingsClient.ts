import { onDocumentReady } from '@prairielearn/browser-utils';

import './lib/clipboardPopover.js';
import { saveButtonEnabling } from './lib/saveButtonEnabling.js';
import { validateId } from './lib/validateId.js';

onDocumentReady(() => {
  const ciidField = document.querySelector('input[name="ciid"]') as HTMLInputElement;
  const shortNames = ciidField.dataset.otherValues?.split(',') ?? [];
  const instanceSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-course-instance-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  ciidField.addEventListener('input', () => {
    validateId({ input: ciidField, otherIds: shortNames });
  });
  ciidField.addEventListener('change', () => {
    validateId({ input: ciidField, otherIds: shortNames });
  });
  if (!instanceSettingsForm || !saveButton) return;
  saveButtonEnabling(instanceSettingsForm, saveButton);
});
