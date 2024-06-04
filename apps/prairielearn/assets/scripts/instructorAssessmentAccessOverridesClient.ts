import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

function setupDateInputValidation(modal: HTMLElement) {
  const startDateInput = modal.querySelector<HTMLInputElement>('.js-start-date');
  const endDateInput = modal.querySelector<HTMLInputElement>('.js-end-date');
  startDateInput?.addEventListener('change', () => {
    endDateInput?.setAttribute('min', startDateInput.value);
  });
}

onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false, container: 'body' });

  const addModal = document.querySelector('#addPolicyModal') as HTMLElement;
  const editModal = document.querySelector('#editPolicyModal') as HTMLElement;

  setupDateInputValidation(addModal);
  setupDateInputValidation(editModal);

  document.querySelectorAll<HTMLButtonElement>('.edit-override-button').forEach((button) => {
    button.addEventListener('click', () => {
      templateFromAttributes(button, editModal, {
        // These are conditionally rendered depending on whether or not this
        // assessment uses groups, so we allow them to be missing.
        'data-user-uid': { selector: '.js-user-uid', allowMissing: true },
        'data-group-name': { selector: '.js-group-name', allowMissing: true },

        'data-start-date': '.js-start-date',
        'data-end-date': '.js-end-date',
        'data-credit': '.js-credit',
        'data-note': '.js-note',
        'data-policy-id': '.js-policy-id',
      });
    });
  });

  const deleteModal = document.querySelector('#deleteModal') as HTMLFormElement;
  document.querySelectorAll<HTMLButtonElement>('.delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      templateFromAttributes(button, deleteModal, {
        'data-policy-id': '.js-policy-id',
      });
    });
  });
});
