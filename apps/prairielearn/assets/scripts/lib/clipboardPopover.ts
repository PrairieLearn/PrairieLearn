import ClipboardJS from 'clipboard';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const clipboard = new ClipboardJS('.btn-copy');
  clipboard.on('success', (e) => {
    $(e.trigger).popover({ content: 'Copied!', placement: 'bottom' }).popover('show');
    window.setTimeout(() => $(e.trigger).popover('hide'), 1000);
  });
});
