import { on } from 'delegated-events';

import './behaviors/custom-file-input.js';
import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false });
});

on('submit', '.needs-validation', function (event) {
  const form = event.target as HTMLFormElement;
  form.reportValidity();
  if (!form.checkValidity()) {
    event.preventDefault();
    event.stopPropagation();
  }
  form.classList.add('was-validated');
});

on('input', '.js-rename-input', function (event) {
  const input = event.target as HTMLInputElement;
  if (input.value === input.dataset.originalValue) {
    input.setCustomValidity('Name must be changed');
  } else {
    input.setCustomValidity('');
  }
  input.reportValidity();
});
