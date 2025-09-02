import './lib/clipboardPopover.js';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(function () {
  const tidField = document.querySelector<HTMLInputElement>('input[name="aid"]')!;
  const otherTids = tidField.dataset.otherValues?.split(',') ?? [];
  const assessmentSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-assessment-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
  const honorCodeCheckbox = document.querySelector<HTMLInputElement>('#require_honor_code');
  const honorCodeInput = document.querySelector<HTMLTextAreaElement>('#honor_code_group');

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

  honorCodeCheckbox?.addEventListener('change', function () {
    if (this.checked) {
      honorCodeInput?.removeAttribute('hidden');
    } else {
      honorCodeInput?.setAttribute('hidden', 'true');
    }
  });
});
