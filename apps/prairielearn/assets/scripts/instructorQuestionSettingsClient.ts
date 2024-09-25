import { onDocumentReady } from '@prairielearn/browser-utils';

import './lib/changeIdButton.js';
import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(() => {
  const qidField = document.querySelector('input[name="qid"]') as HTMLInputElement;
  const otherQids = qidfield.dataset.otherValues?.split(',') ?? [];
  const questionSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-question-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  function validateId() {
    const newValue = qidfield.value;

    if (otherQids.includes(newValue) && newValue !== qidfield.defaultValue) {
      qidfield.setCustomValidity('This ID is already in use');
    } else {
      qidfield.setCustomValidity('');
    }

    qidfield.reportValidity();
  }

  qidfield.addEventListener('input', validateId);
  qidfield.addEventListener('change', validateId);

  if (!questionSettingsForm || !saveButton) return;
  saveButtonEnabling(questionSettingsForm, saveButton);
});
