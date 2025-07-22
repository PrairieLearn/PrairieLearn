import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { renderHistMini } from '../../src/components/HistMini.js';

onDocumentReady(() => {
  document.getElementById('resetQuestionVariantsModal')?.addEventListener('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) =>
    renderHistMini({
      selector: element,
      data: JSON.parse(element.dataset.data ?? '[]'),
      options: JSON.parse(element.dataset.options ?? '{}'),
    }),
  );
});
