import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    console.log(button, modal);

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });
});
