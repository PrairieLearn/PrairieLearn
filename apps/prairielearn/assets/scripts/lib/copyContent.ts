export function copyContentModal(copyForm: HTMLFormElement | null) {
  if (!copyForm) return;

  const courseSelect = copyForm.querySelector<HTMLSelectElement>('select[name="to_course_id"]');
  courseSelect?.addEventListener('change', () => {
    const option = courseSelect.selectedOptions[0];

    if (option) {
      copyForm.action = option?.dataset.copyUrl ?? '';
      copyForm.querySelectorAll<HTMLInputElement>('input[name="__csrf_token"]').forEach((input) => {
        input.value = option?.dataset.csrfToken ?? '';
      });
    }
  });
}
