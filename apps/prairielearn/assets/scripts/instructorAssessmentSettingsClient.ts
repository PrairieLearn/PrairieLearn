import './lib/clipboardPopover.js';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(function () {
  const shortNameField = document.querySelector<HTMLInputElement>('input[name="short_name"]')!;
  const otherShortNames = shortNameField.dataset.otherValues?.split(',') ?? [];
  const assessmentSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-assessment-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
  const honorCodeCheckbox = document.querySelector<HTMLInputElement>('#require_honor_code');
  const honorCodeInput = document.querySelector<HTMLTextAreaElement>('#honor_code_group');

  function validateId() {
    const newValue = shortNameField.value;

    if (otherShortNames.includes(newValue) && newValue !== shortNameField.defaultValue) {
      shortNameField.setCustomValidity('This short name is already in use');
    } else {
      shortNameField.setCustomValidity('');
    }

    shortNameField.reportValidity();
  }
  shortNameField.addEventListener('input', validateId);
  shortNameField.addEventListener('change', validateId);

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
