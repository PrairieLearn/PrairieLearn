import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import type { Lti13CourseRequestInput } from '../../src/pages/instructorRequestCourse/instructorRequestCourse.types.js';

onDocumentReady(() => {
  document.querySelectorAll<HTMLInputElement>('input[name=cr-role]').forEach((radio) =>
    radio.addEventListener('change', () => {
      const role = radio.value;
      document
        .querySelectorAll<HTMLButtonElement>('.question-form button[type=submit]')
        .forEach((button) => (button.disabled = role !== 'instructor'));
      document
        .querySelectorAll<HTMLElement>('.role-comment')
        .forEach((comment) => comment.classList.add('d-none'));
      if (role) {
        document.querySelector<HTMLElement>(`.role-comment-${role}`)?.classList.remove('d-none');
      }
    }),
  );

  // Only show the "other" referral source input when "other" is selected.
  document
    .querySelector<HTMLInputElement>('#cr-referral-source')
    ?.addEventListener('change', function () {
      const referralSourceOther = document.querySelector<HTMLInputElement>(
        '#cr-referral-source-other',
      );
      if (!referralSourceOther) return;

      if (this.value === 'other') {
        referralSourceOther.classList.remove('d-none');
        referralSourceOther.required = true;
        referralSourceOther.focus();
      } else {
        referralSourceOther.classList.add('d-none');
        referralSourceOther.required = false;
      }
    });

  const courseRequestLti13Info = decodeData<Lti13CourseRequestInput>('course-request-lti13-info');
  if (courseRequestLti13Info !== null) {
    const lti13Modal = window.bootstrap.Modal.getOrCreateInstance(
      '#fill-course-request-lti13-modal',
    );
    lti13Modal.show();

    const autoFillLti13Button = document.getElementById('fill-course-request-lti13-info');

    autoFillLti13Button?.addEventListener('click', () => {
      const courseRequestForm = document.querySelector<HTMLFormElement>(
        'form[name="course-request"]',
      );
      if (!courseRequestForm) return;

      const formElements = courseRequestForm.elements;
      for (const [elementName, elementValue] of Object.entries(courseRequestLti13Info)) {
        const input = formElements.namedItem(elementName);
        if (input) {
          (input as HTMLInputElement).value = elementValue;
        }
      }

      lti13Modal.hide();
    });
  }
});
