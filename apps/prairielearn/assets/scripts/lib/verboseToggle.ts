// Toggles the visibility of verbose (faint) lines of job output. Uses event
// delegation on `document` so it also works for job output that is rendered
// after page load, e.g. by a hydrated React component.
document.addEventListener('change', (event) => {
  const checkbox = event.target;
  if (
    !(checkbox instanceof HTMLInputElement) ||
    !checkbox.classList.contains('js-toggle-verbose')
  ) {
    return;
  }

  const targetOutput = document.getElementById(checkbox.dataset.targetId ?? '');
  targetOutput?.style.setProperty('--verbose-display', checkbox.checked ? '' : 'none');
});
