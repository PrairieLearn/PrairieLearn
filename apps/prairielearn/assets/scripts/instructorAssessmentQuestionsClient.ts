import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
