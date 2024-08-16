import { on } from 'delegated-events';

import { isBootstrapCompatEnabled } from '../lib/bootstrap-compat-utils.js';

// Ensure that custom file inputs display the file name.
//
// Bootstrap 5 doesn't require JavaScript for this behavior, so we'll only enable
// it if Bootstrap compatibility mode is not enabled (i.e., we're using Bootstrap 4).
if (!isBootstrapCompatEnabled()) {
  on('change', 'input[type="file"].custom-file-input', function (event) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\\/g, '/').replace(/.*\//, '');
    const label = input.closest('.custom-file')?.querySelector('.custom-file-label');
    if (label) label.textContent = value;
  });
}
