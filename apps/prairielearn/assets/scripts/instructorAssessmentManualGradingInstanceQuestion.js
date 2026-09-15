import { onDocumentReady } from '@prairielearn/browser-utils';

import { mathjaxTypeset } from '../../src/lib/client/mathjax.js';

onDocumentReady(() => {
  document.addEventListener('keypress', (event) => {
    if (event.repeat) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (
      !['TEXTAREA', 'SELECT'].includes(event.target.tagName) &&
      (event.target.tagName !== 'INPUT' ||
        ['radio', 'button', 'submit', 'checkbox'].includes(event.target.type)) &&
      !event.target.isContentEditable
    ) {
      if (document.querySelector('.modal.show')) return;

      const mainGradingPanel = document.querySelector('.js-main-grading-panel');
      if (!mainGradingPanel) return;

      for (const item of mainGradingPanel.querySelectorAll('[data-key-binding]')) {
        if (
          item.dataset.keyBinding?.toLowerCase() !== event.key.toLowerCase() ||
          item.matches(':disabled, [readonly]') ||
          !isVisible(item)
        ) {
          continue;
        }

        if (item.classList.contains('js-submission-feedback')) {
          event.preventDefault();
          item.focus();
        } else {
          item.dispatchEvent(new MouseEvent('click'));
        }
      }
    }
  });
  const modal = document.querySelector('#conflictGradingJobModal');
  if (modal) {
    window.bootstrap.Modal.getOrCreateInstance(modal).show();
  }
});

window.mathjaxTypeset = mathjaxTypeset;

function isVisible(element) {
  return element.offsetParent !== null || element.getClientRects().length > 0;
}
