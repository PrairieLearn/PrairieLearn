import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

// TODO: convert this all to standard JS instead of jQuery.
onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false, container: 'body' });

  console.log('form?', document.querySelector('#addPolicyModal form'));

  // TODO: add check for edit modal as well.
  // TODO: unify add/edit modals, since they're the same.
  const addModal = document.querySelector('#addPolicyModal') as HTMLElement;
  const startDateInput = addModal.querySelector<HTMLInputElement>('#start_date');
  const endDateInput = addModal.querySelector<HTMLInputElement>('#end_date');
  startDateInput?.addEventListener('change', () => {
    endDateInput?.setAttribute('min', startDateInput.value);
  });

  const editModal = document.querySelector('#editPolicyModal') as HTMLElement;
  document.querySelectorAll<HTMLButtonElement>('.edit-override-button').forEach((button) => {
    button.addEventListener('click', () => {
      templateFromAttributes(button, editModal, {
        // These are conditionally rendered depending on whether or not this
        // assessment uses groups, so we allow them to be missing.
        'data-user-uid': { selector: '#edit-student_uid', allowMissing: true },
        'data-group-name': { selector: '#edit-group_name', allowMissing: true },

        'data-start-date': '#edit-start_date',
        'data-end-date': '#edit-end_date',
        'data-credit': '#edit-credit',
        'data-note': '#edit-note',
        'data-policy-id': 'input[name="policy_id"]',
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
