import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.getElementById('resetQuestionVariantsModal')?.addEventListener('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    if (modal.querySelector('.js-instance-question-id') === null) {
      // The version of this modal shown for Exam assessments doesn't have this element.
      // Skip templating to avoid an error being logged.
      return;
    }

    templateFromAttributes(button, modal, {
      'data-instance-question-id': '.js-instance-question-id',
    });
  });
});
