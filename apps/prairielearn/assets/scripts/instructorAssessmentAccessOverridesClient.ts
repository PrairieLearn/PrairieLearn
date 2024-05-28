import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

// TODO: convert this all to standard JS instead of jQuery.
onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false, container: 'body' });

  console.log('form?', document.querySelector('#addPolicyModal form'));

  // TODO: add check for edit modal as well.
  // TODO: unify add/edit modals, since they're the same.
  document.querySelector('#addPolicyModal form')?.addEventListener('submit', (event) => {
    console.log('CHECKING DATES');
    // We always parse the date as UTC since it's not trivial to parse the
    // date in the course's timezone. All we care about is their relative
    // ordering.
    //
    // TODO: this will probably break around Daylight Saving Time changes.
    const startDate = new Date($('#start_date').val() + 'Z');
    const endDate = new Date($('#end_date').val() + 'Z');

    console.log('comparing', startDate, endDate);

    if (startDate >= endDate) {
      event.preventDefault();
      $('#end_date').addClass('is-invalid');
      $('#end_date_error').text('End date should be greater than the start date.').show();
    }
  });

  const editModal = document.querySelector('#editPolicyModal') as HTMLFormElement;
  document.querySelectorAll<HTMLButtonElement>('.edit-override-button').forEach((button) => {
    button.addEventListener('click', () => {
      templateFromAttributes(button, editModal, {
        'data-user-uid': '#edit-student_uid',
        'data-group-name': '#edit-group_name',
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
