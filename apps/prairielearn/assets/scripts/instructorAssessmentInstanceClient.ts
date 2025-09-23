import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.getElementById('resetQuestionVariantsModal')?.addEventListener('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-instance-question-id': '.js-instance-question-id',
    });
  });

  // The exam warning modal doesn't need to populate instance question ID since it doesn't perform any action
  // We add an event listener for consistency and potential future functionality
  document.getElementById('examResetWarningModal')?.addEventListener('show.bs.modal', () => {
    // No additional setup needed for the warning modal
  });
});
