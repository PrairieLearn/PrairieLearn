import { onDocumentReady } from '@prairielearn/browser-utils';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';
import './lib/clipboardPopover.js';

onDocumentReady(() => {
  const courseSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-course-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  if (!courseSettingsForm || !saveButton) return;

  saveButtonEnabling(courseSettingsForm, saveButton);
});
