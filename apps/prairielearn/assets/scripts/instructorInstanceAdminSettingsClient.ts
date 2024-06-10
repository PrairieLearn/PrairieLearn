import './lib/clipboardPopover.js';
import './lib/qrCodeButton.js';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false });
});
