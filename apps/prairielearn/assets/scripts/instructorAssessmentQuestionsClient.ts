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

  $('[data-toggle="popover"]').popover({ sanitize: false });

  $('.js-sync-popover[data-toggle="popover"]').popover({ sanitize: false });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
});
