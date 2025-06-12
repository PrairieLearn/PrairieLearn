import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  document.getElementById('add-course-modal')?.addEventListener('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-course-instance-id': '.js-course-instance-id',
      'data-course-instance-short-label': '.js-course-instance-short-label',
    });
  });

  document.getElementById('remove-course-modal')?.addEventListener('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-course-instance-id': '.js-course-instance-id',
      'data-course-instance-short-label': '.js-course-instance-short-label',
    });
  });
});
