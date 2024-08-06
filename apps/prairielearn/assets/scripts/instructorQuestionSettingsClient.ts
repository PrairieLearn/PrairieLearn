import { onDocumentReady } from '@prairielearn/browser-utils';
import './lib/changeIdButton.js';

onDocumentReady(() => {
  $('[data-toggle="tooltip"]').tooltip();
});
