import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-toggle="popover"]', {
    add(el) {
      console.log('popover element!', el);
      $(el).popover({ sanitize: false });
    },
  });
});
