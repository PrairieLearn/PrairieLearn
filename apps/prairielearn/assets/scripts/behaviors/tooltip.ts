import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

// We need to wrap this in `onDocumentReady` because Bootstrap doesn't
// add its jQuery API to the jQuery object until after this event.
// `selector-observer` will start running its callbacks immediately, so they'd
// otherwise execute too soon.
onDocumentReady(() => {
  observe('[data-toggle="tooltip"]', {
    add(el) {
      // We continue to use the jQuery interface to ensure compatibility with Bootstrap 4.
      $(el).tooltip();
    },
    remove(el) {
      // We continue to use the jQuery interface to ensure compatibility with Bootstrap 4.
      $(el).tooltip('dispose');
    },
  });
});
