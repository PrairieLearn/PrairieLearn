import ClipboardJS from 'clipboard';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const clipboard = new ClipboardJS('.btn-copy');
  clipboard.on('success', (e) => {
    const popover = window.bootstrap.Popover.getOrCreateInstance(e.trigger, {
      content: 'Copied!',
      placement: 'bottom',
      trigger: 'manual',
    });
    popover.show();
    window.setTimeout(() => popover.hide(), 1000);
  });
});
