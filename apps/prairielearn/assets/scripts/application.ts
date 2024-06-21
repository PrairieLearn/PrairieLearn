import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const BOOTSTRAP_LEGACY_ATTRIBUTES = [
  'toggle',
  'target',
  'html',
  'placement',
  'content',
  'trigger',
  'dismiss',
];

onDocumentReady(() => {
  BOOTSTRAP_LEGACY_ATTRIBUTES.forEach((attr) => {
    $(`[data-${attr}]`).each((i, el) => {
      const val = el.dataset[attr];
      if (val) {
        el.setAttribute(`data-bs-${attr}`, val);
      }
    });
  });

  // In Bootstrap 5, elements can be added as direct children of `.input-group`
  // without using a wrapping `.input-group-prepend` or `.input-group-append`.
  // This bit of JavaScript will re-parent the children of `.input-group-*` into
  // the containing `.input-group` element.
  observe('.input-group-prepend, .input-group-append', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;
      if (!el.parentElement?.classList.contains('input-group')) return;

      for (const child of Array.from(el.children)) {
        el.parentElement?.insertBefore(child, el);
      }
      el.remove();

      const elementClass = el.classList.contains('input-group-prepend')
        ? 'input-group-prepend'
        : 'input-group-append';

      console.warn(
        `Bootstrap 5 no longer requires ${elementClass} elements to be wrapped in an input-group. Please update your HTML to remove the wrapping ${elementClass} element.`,
        el,
      );
    },
  });

  observe('.form-group', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      el.classList.add('mb-3');
      console.warn('Bootstrap 5 replaced .form-group with .mb-3. Please update your HTML.', el);
    },
  });
});
