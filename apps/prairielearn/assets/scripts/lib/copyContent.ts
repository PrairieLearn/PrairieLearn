export function copyContentModal(copyQuestionForm: HTMLFormElement | null) {
  if (!copyQuestionForm) {
    return;
  }

  const courseSelect = copyQuestionForm.querySelector<HTMLSelectElement>(
    'select[name="to_course_id"]',
  );
  courseSelect?.addEventListener('change', () => {
    const option = courseSelect.selectedOptions[0];

    if (option) {
      copyQuestionForm.action = option?.dataset.copyUrl ?? '';
      copyQuestionForm
        .querySelectorAll<HTMLInputElement>('input[name="__csrf_token"]')
        .forEach((input) => {
          input.value = option?.dataset.csrfToken ?? '';
        });
    }
  });
}
