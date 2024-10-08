import { onDocumentReady } from '@prairielearn/browser-utils';

import './lib/changeIdButton.js';
import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(() => {
  const qidField = document.querySelector('input[name="qid"]') as HTMLInputElement;
  const otherQids = qidField.dataset.otherValues?.split(',') ?? [];
  const questionSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-question-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  function validateId() {
    const newValue = qidField.value;

    if (otherQids.includes(newValue) && newValue !== qidField.defaultValue) {
      qidField.setCustomValidity('This ID is already in use');
    } else {
      qidField.setCustomValidity('');
    }

    qidField.reportValidity();
  }

  qidField.addEventListener('input', validateId);
  qidField.addEventListener('change', validateId);

  if (!questionSettingsForm || !saveButton) return;
  saveButtonEnabling(questionSettingsForm, saveButton);
});
