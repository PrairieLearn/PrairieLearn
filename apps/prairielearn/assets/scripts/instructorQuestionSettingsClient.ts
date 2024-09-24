import { onDocumentReady } from '@prairielearn/browser-utils';

import './lib/changeIdButton.js';
import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(() => {
  saveButtonEnabling(
    document.querySelector('form[name="edit-question-settings-form"]') as HTMLFormElement,
    document.querySelector('#save-button') as HTMLButtonElement,
  );
});
