window.PLCheckboxClear = function (button) {
  const name = button.dataset.name;
  const form = button.closest('form');
  const checkboxes = form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
  checkboxes.forEach((checkbox) => (checkbox.checked = false));
};
