import { on } from 'delegated-events';

// Toggles the visibility of verbose (faint) lines of job output. `delegated-events`
// delegates at the document root, so this also works for job output that is
// rendered after page load, e.g. by a hydrated React component.
on('change', '.js-toggle-verbose', (event) => {
  const checkbox = event.currentTarget;
  if (!(checkbox instanceof HTMLInputElement)) return;

  const targetOutput = document.getElementById(checkbox.dataset.targetId ?? '');
  targetOutput?.style.setProperty('--verbose-display', checkbox.checked ? '' : 'none');
});
