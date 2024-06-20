import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(function () {
  $('.js-change-id-button')
    .popover({ sanitize: false, container: 'body', html: true, placement: 'auto' })
    .on('shown.bs.popover', function () {
      const previousValue = this.dataset.previousValue;
      const otherValues = JSON.parse(this.dataset.otherValues ?? '[]');

      const form = document.querySelector<HTMLFormElement>('form[name="change-id-form"]');
      const input = form?.querySelector<HTMLInputElement>('input[name="id"]');

      function validateId() {
        const newValue = input?.value;

        if (newValue === previousValue) {
          input?.setCustomValidity('ID must be changed');
        } else if (otherValues.includes(newValue)) {
          input?.setCustomValidity('This ID is already in use');
        } else {
          input?.setCustomValidity('');
        }

        input?.reportValidity();
      }

      input?.addEventListener('input', validateId);
      input?.addEventListener('change', validateId);

      form?.addEventListener('submit', function (event) {
        validateId();
        if (!form?.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        }
        form.classList.add('was-validated');
      });
    });
});
