import { on } from 'delegated-events';

on('submit', '.needs-validation', function (event) {
  const form = event.target as HTMLFormElement;
  form.reportValidity();
  if (!form.checkValidity()) {
    event.preventDefault();
    event.stopPropagation();
  }
  form.classList.add('was-validated');
});

on('input', '.js-rename-input', function (event) {
  const input = event.target as HTMLInputElement;
  if (input.value === input.dataset.originalValue) {
    input.setCustomValidity('Name must be changed');
  } else {
    input.setCustomValidity('');
  }
  input.reportValidity();
});

on('change', 'input[type="file"]', function (event) {
  const input = event.target as HTMLInputElement;
  const fileCount = input.files?.length ?? 0;
  const maxFileCount = input.dataset.maxFileCount;
  const maxFileSize = input.dataset.maxFileSize;

  if (maxFileCount != null && fileCount > Number(maxFileCount)) {
    input.setCustomValidity(`You can only upload up to ${maxFileCount} files`);
  } else if (
    maxFileSize != null &&
    Array.from(input.files || []).some((file) => file.size > Number(maxFileSize))
  ) {
    input.setCustomValidity(
      `You can only upload files up to ${input.dataset.maxFileSizeFormatted ?? maxFileSize} bytes`,
    );
  } else {
    input.setCustomValidity('');
  }
  input.reportValidity();
});
