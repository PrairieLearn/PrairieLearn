import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

// TODO: convert this all to standard JS instead of jQuery.
onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false, container: 'body' });

  const newOverrideForm = document.querySelector('#add-new-override');
  newOverrideForm?.addEventListener('submit', (event) => {
    // We always parse the date as UTC since it's not trivial to parse the
    // date in the course's timezone. All we care about is their relative
    // ordering.
    //
    // TODO: this will probably break around Daylight Saving Time changes.
    const startDate = new Date($('#start_date').val() + 'Z');
    const endDate = new Date($('#end_date').val() + 'Z');

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
        'data-credit': '#edit-credit',
        'data-note': '#edit-note',
        'data-policy-id': 'input[name="policy_id"]',
      });

      // TODO: update things such that we can use `templateFromAttributes` above.
      const policy_start_date_string = (button.getAttribute('data-start-date') as string)
        .slice(0, -6)
        .replace(' ', 'T');
      const policy_end_date_string = (button.getAttribute('data-end-date') as string)
        .slice(0, -6)
        .replace(' ', 'T');

      (editModal.querySelector('#edit-start_date') as HTMLInputElement).value =
        policy_start_date_string;
      (editModal.querySelector('#edit-end_date') as HTMLInputElement).value =
        policy_end_date_string;
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
