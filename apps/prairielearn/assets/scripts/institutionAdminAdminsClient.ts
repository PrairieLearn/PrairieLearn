import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { assertDefined } from '../../src/lib/types.js';

onDocumentReady(() => {
  const removeAdminModal = document.getElementById('removeAdminModal');
  assertDefined(removeAdminModal);
  document.querySelectorAll<HTMLButtonElement>('.js-remove-admin').forEach((el) => {
    el.addEventListener('click', () => {
      templateFromAttributes(el, removeAdminModal, {
        'data-name-and-uid': '.js-name-and-uid',
        'data-institution-administrator-id': '.js-institution-administrator-id',
      });
    });
  });
});
