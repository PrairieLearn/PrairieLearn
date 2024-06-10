import { onDocumentReady } from '@prairielearn/browser-utils';
import './lib/changeIdValidation.js';

onDocumentReady(() => {
  $('[data-toggle="popover"]').popover({ sanitize: false });
});
