import { onDocumentReady } from '@prairielearn/browser-utils';
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

  $('.edit-override-button').on('click', function (event) {
    event.preventDefault();
    const button = $(this);
    const editOverrideForm = $('#edit-override-form');
    editOverrideForm.find('#edit-assessment_id').val(button.data('assessment-id'));
    editOverrideForm.find('#edit-student_uid').val(button.data('user-id'));
    editOverrideForm.find('#edit-group_id').val(button.data('group-id'));
    editOverrideForm.find('#edit-credit').val(button.data('credit'));
    const policy_start_date_string = button.data('start-date').slice(0, -6).replace(' ', 'T');
    const policy_end_date_string = button.data('end-date').slice(0, -6).replace(' ', 'T');

    editOverrideForm.find('#edit-start_date').val(policy_start_date_string);
    editOverrideForm.find('#edit-end_date').val(policy_end_date_string);
    editOverrideForm.find('#edit-created_by').val(button.data('created-by'));
    editOverrideForm.find('#edit-note').val(button.data('note'));
    editOverrideForm.find('#edit-type').val(button.data('type'));
    const policyId = $(this).data('policy-id');
    $('#edit-override-form input[name="policy_id"]').val(policyId);
    const groupName = $(this).data('group-name');
    $('#edit-group_name').val(groupName);
    $('#editPolicyModal').modal('show');
  });

  $('.delete-button').on('click', function () {
    const button = $(this);
    const policyId = $(this).data('policy-id');
    const csrfToken = button.data('__csrf_token');
    const action = button.data('__action');

    // Set the values of the form's hidden input fields
    $('#deleteModal input[name="policy_id"]').val(policyId);
    $('#deleteModal input[name="csrf_token"]').val(csrfToken);
    $('#confirmDeleteButton').data('policy-id', policyId);

    $('#deleteModal input[name="__action"]').val(action);

    // Show the modal confirmation dialog
    $('#deleteModal').modal('show');
  });

  // Event listener for confirm delete button in the modal
  $('#confirmDeleteButton').on('click', function () {
    const button = $(this);
    const policyId = button.data('policy-id');

    $('form[name="delete-override-form"] input[name="policy_id"]').val(policyId);
    $('form[name="delete-override-form"] input[name="__action"]').val('delete_override');

    $('form[name="delete-override-form"]').submit();
  });
});
