import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('input[name=cr-role]').on('change', function () {
    const role = (this as HTMLInputElement).value;
    $('.question-form button').prop('disabled', role !== 'instructor');
    $('.role-comment').hide();
    $('.role-comment-' + role).show();
  });

  // Only show the "other" referral source input when "other" is selected.
  $('#cr-referral-source').on('change', function () {
    if ((this as HTMLInputElement).value === 'other') {
      $('#cr-referral-source-other').removeClass('d-none').attr('required', 'required').focus();
    } else {
      $('#cr-referral-source-other').addClass('d-none').removeAttr('required');
    }
  });

  const courseRequestLti13Info = decodeData('course-request-lti13-info');
  if (courseRequestLti13Info !== null) {
    $('#fill-course-request-lti13-modal').modal('show');

    const autoFillLti13Button = document.getElementById('fill-course-request-lti13-info');

    autoFillLti13Button?.addEventListener('click', () => {
      const courseRequestForm = document.querySelector<HTMLFormElement>(
        'form[name="course-request"]',
      );

      if (!courseRequestForm) {
        return;
      }

      const formElements = courseRequestForm.elements;
      for (const elementName of Object.keys(courseRequestLti13Info)) {
        const input = formElements.namedItem(elementName) as HTMLInputElement;
        if (input) {
          input.value = courseRequestLti13Info[elementName];
        }
      }

      $('#fill-course-request-lti13-modal').modal('hide');
    });
  }
});
