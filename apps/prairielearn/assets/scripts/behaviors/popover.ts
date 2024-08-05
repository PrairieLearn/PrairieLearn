import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-toggle="popover"]', {
    add(el) {
      $(el).popover({ sanitize: false });
    },
    remove(el) {
      $(el).popover('dispose');
    },
  });
});
