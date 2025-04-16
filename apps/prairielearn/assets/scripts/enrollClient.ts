import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('#add-course-modal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-course-instance-id': '.js-course-instance-id',
      'data-course-instance-short-label': '.js-course-instance-short-label',
    });
  });

  $('#remove-course-modal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-course-instance-id': '.js-course-instance-id',
      'data-course-instance-short-label': '.js-course-instance-short-label',
    });
  });
});
