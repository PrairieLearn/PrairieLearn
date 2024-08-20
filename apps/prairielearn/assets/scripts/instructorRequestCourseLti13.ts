import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const courseRequestLti13Info = decodeData('courseRequestLti13Info');

  if (courseRequestLti13Info === null) {
    return;
  }

  const Lti13Modal = new bootstrap.Modal(document.getElementById('lti13FillModal'), {});

  Lti13Modal.show();

  const autoFillLti13Button = document.getElementById('fillCourseRequestLti13');

  autoFillLti13Button?.addEventListener('click', () => {
    const courseRequestForm = document.querySelector(
      'form[name="course-request"]',
    ) as HTMLFormElement;

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

    Lti13Modal.hide();
  });
});
