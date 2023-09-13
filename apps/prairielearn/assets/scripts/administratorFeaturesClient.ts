import { on } from 'delegated-events';

import './lib/morphdom';
import './lib/htmx';

import 'htmx.org/dist/ext/loading-states.js';
import 'htmx.org/dist/ext/morphdom-swap.js';
import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  on('click', '.js-delete-feature-grant', (e) => {
    const modal = document.querySelector<HTMLElement>('#delete-feature-grant-modal');
    templateFromAttributes(e.currentTarget as HTMLElement, modal, {
      'data-feature-grant-id': '.js-feature-grant-id',
    });
  });
});
