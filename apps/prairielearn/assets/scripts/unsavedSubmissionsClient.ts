import { observe } from 'selector-observer';

import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import { initializeUnsavedSubmissions } from './lib/unsavedSubmissions.js';

onDocumentReady(() => {
  const config =
    decodeData<Parameters<typeof initializeUnsavedSubmissions>[1]>('unsaved-submission-data');
  observe('.question-container form.question-form', {
    constructor: HTMLFormElement,
    initialize(form) {
      const cleanup = initializeUnsavedSubmissions(form, config);
      return { remove: () => cleanup() };
    },
  });
});
