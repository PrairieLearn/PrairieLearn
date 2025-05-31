import { onDocumentReady } from '@prairielearn/browser-utils';

import { copyContentModal } from './lib/copyContent.js';

onDocumentReady(() => {
  const copyForm = document.querySelector<HTMLFormElement>('.js-copy-course-instance-form');
  copyContentModal(copyForm);
});
