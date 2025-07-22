import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { HistMiniHtml } from '../../src/components/HistMini.js';

onDocumentReady(() => {
  document.getElementById('resetQuestionVariantsModal')?.addEventListener('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document
    .querySelectorAll<HTMLElement>('.js-histmini')
    .forEach((element) =>
      HistMiniHtml({
        selector: element,
        data: JSON.parse(element.dataset.data ?? '[]'),
        options: JSON.parse(element.dataset.options ?? '{}'),
      }),
    );
});
