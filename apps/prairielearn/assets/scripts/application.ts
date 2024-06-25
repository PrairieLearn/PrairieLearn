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

  // The `.form-group` class no longer exists. Instead, they recommend using
  // the normal spacing utilities. We'll patch this by adding the `.mb-3`
  // class to all `.form-group` elements, as this matches the spacing previously
  // provided by `.form-group`.
  observe('.form-group', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      el.classList.add('mb-3');
      console.warn('Bootstrap 5 replaced .form-group with .mb-3. Please update your HTML.', el);
    },
  });

  // The classes used to color badges have changed. We'll patch
  // this by replacing the `.badge-*` class with the new `.text-bg-*` class.
  const BADGE_COLORS = [
    'primary',
    'secondary',
    'success',
    'danger',
    'warning',
    'info',
    'light',
    'dark',
  ];
  const BADGE_SELECTOR = BADGE_COLORS.map((color) => `.badge-${color}`).join(', ');
  observe(BADGE_SELECTOR, {
    add(el) {
      if (!(el instanceof HTMLElement)) return;
      if (!el.classList.contains('badge')) return;

      const color = BADGE_COLORS.find((color) => el.classList.contains(`badge-${color}`));
      el.classList.remove(`badge-${color}`);
      el.classList.add(`text-bg-${color}`);
      console.warn('Bootstrap 5 replaced .badge-* with .text-bg-*. Please update your HTML.', el);
    },
  });

  // The `.badge-pill` was replaced by `.rounded-pill`.
  observe('.badge-pill', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;
      if (!el.classList.contains('badge')) return;

      el.classList.add('rounded-pill');
      console.warn(
        'Bootstrap 5 replaced .badge-pill with .rounded-pill. Please update your HTML.',
        el,
      );
    },
  });

  // The `.dropdown-menu-left` and `.dropdown-menu-right` classes were replaced
  // by `.dropdown-menu-start` and `.dropdown-menu-end`, respectively.
  observe('.dropdown-menu-right, .dropdown-menu-left', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;
      if (!el.classList.contains('dropdown-menu')) return;

      const position = el.classList.contains('dropdown-menu-right') ? 'end' : 'start';
      el.classList.add(`dropdown-menu-${position}`);
      console.warn(
        'Bootstrap 5 replaced .dropdown-menu-{left,right} with .dropdown-menu-{start|end}. Please update your HTML.',
        el,
      );
    },
  });

  // `label` no longer receives a default bottom margin; the `form-label` class
  // must be added to form labels.
  observe('label', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;
      if (el.closest('.form-group') == null) return;

      el.classList.add('form-label');
      console.warn(
        'Bootstrap 5 requires the .form-label class on form labels. Please update your HTML.',
        el,
      );
    },
  });

  observe('.custom-select', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      el.classList.add('form-select');
      console.warn(
        'Bootstrap 5 replaced the .custom-select class with .form-select. Please update your HTML.',
        el,
      );
    },
  });

  const FONT_WEIGHT_CLASSES = [
    'font-weight-bold',
    'font-weight-bolder',
    'font-weight-normal',
    'font-weight-light',
    'font-weight-lighter',
  ];
  observe(FONT_WEIGHT_CLASSES.map((cls) => `.${cls}`).join(', '), {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      const fontWeightClasses = FONT_WEIGHT_CLASSES.filter((cls) => el.classList.contains(cls));
      for (const cls of fontWeightClasses) {
        const newClass = cls.replace('font-weight', 'fw');
        el.classList.add(newClass);
      }

      console.warn(
        'Bootstrap 5 replaced font-weight classes with fw-* classes. Please update your HTML.',
        el,
      );
    },
  });

  observe('.text-monospace', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      el.classList.add('font-monospace');
      console.warn(
        'Bootstrap 5 replaced .text-monospace with .font-monospace. Please update your HTML.',
        el,
      );
    },
  });

  observe('.sr-only', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      el.classList.add('visually-hidden');
      console.warn(
        'Bootstrap 5 replaced .sr-only with .visually-hidden. Please update your HTML.',
        el,
      );
    },
  });

  observe('.sr-only-focusable', {
    add(el) {
      if (!(el instanceof HTMLElement)) return;

      el.classList.add('visually-hidden-focusable');
      console.warn(
        'Bootstrap 5 replaced .sr-only-focusable with .visually-hidden-focusable. Please update your HTML.',
        el,
      );
    },
  });
});
