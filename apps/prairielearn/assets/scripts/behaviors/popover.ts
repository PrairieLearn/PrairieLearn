import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-toggle="popover"]', {
    add(el) {
      $(el)
        .popover({ sanitize: false })
        .on('shown.bs.popover', () => {
          // If MathJax is loaded on this page, attempt to typeset any math
          // that may be in the popover.
          if (typeof window.MathJax !== 'undefined') {
            window.MathJax.typesetPromise([el]);
          }
        });
    },
    remove(el) {
      $(el).popover('dispose');
    },
  });
});
