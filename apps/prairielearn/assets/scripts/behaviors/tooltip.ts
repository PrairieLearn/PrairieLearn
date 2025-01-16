import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-toggle="tooltip"]', {
    add(el) {
      new window.bootstrap.Tooltip(el);
    },
    remove(el) {
      window.bootstrap.Tooltip.getInstance(el)?.dispose();
    },
  });
});
