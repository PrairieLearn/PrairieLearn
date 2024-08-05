import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-toggle="popover"]', {
    add(el) {
      $(el)
        .popover({ sanitize: false })
        .on('shown.bs.popover', () => {
          // TODO: automatically typeset MathJax if it's on the page.
        });
    },
    remove(el) {
      $(el).popover('dispose');
    },
  });
});
