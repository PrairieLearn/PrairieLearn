import { on } from 'delegated-events';

// Ensure that custom file inputs display the file name.
on('change', 'input[type="file"].custom-file-input', function (event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\\/g, '/').replace(/.*\//, '');
  const label = input.closest('.custom-file')?.querySelector('.custom-file-label');
  if (label) label.textContent = value;
});
