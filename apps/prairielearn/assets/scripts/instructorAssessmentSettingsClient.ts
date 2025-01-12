import './lib/clipboardPopover.js';
import './lib/qrCodeButton.js';
import './lib/changeIdButton.js';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(function () {
  const tidField = document.querySelector('input[name="aid"]') as HTMLInputElement;
  const otherTids = tidField.dataset.otherValues?.split(',') ?? [];
  const assessmentSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-assessment-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  function validateId() {
    const newValue = tidField.value;

    if (otherTids.includes(newValue) && newValue !== tidField.defaultValue) {
      tidField.setCustomValidity('This ID is already in use');
    } else {
      tidField.setCustomValidity('');
    }

    tidField.reportValidity();
  }
  tidField.addEventListener('input', validateId);
  tidField.addEventListener('change', validateId);

  if (!assessmentSettingsForm || !saveButton) return;
  saveButtonEnabling(assessmentSettingsForm, saveButton);
});
