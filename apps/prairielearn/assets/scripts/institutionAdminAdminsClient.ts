import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const removeAdminModal = document.getElementById('removeAdminModal') as HTMLElement;
  document.querySelectorAll<HTMLButtonElement>('.js-remove-admin').forEach((el) => {
    el.addEventListener('click', () => {
      templateFromAttributes(el, removeAdminModal, {
        'data-name-and-uid': '.js-name-and-uid',
        'data-institution-administrator-id': '.js-institution-administrator-id',
      });
    });
  });
});
