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

const BOOTSTRAP_BREAKPOINTS = ['sm', 'md', 'lg', 'xl', 'xxl'];

onDocumentReady(() => {
  BOOTSTRAP_LEGACY_ATTRIBUTES.forEach((attr) => {
    $(`[data-${attr}]`).each((i, el) => {
      const val = el.dataset[attr];
      if (val) {
        el.setAttribute(`data-bs-${attr}`, val);
      }
    });
  });

  // Bootstrap 5 replaced "left"/"right" with "start"/"end" for RTL support.
  const SPACING_PREFIX_MAP: Record<string, any> = { ml: 'ms', mr: 'me', pl: 'ps', pr: 'pe' };
  const SPACING_SUFFIXES = ['0', '1', '2', '3', '4', '5', 'auto'];
  const SPACING_CLASSES = Object.keys(SPACING_PREFIX_MAP)
    .flatMap((prefix) =>
      SPACING_SUFFIXES.map((suffix) => `.${prefix}-${suffix}`).concat(
        BOOTSTRAP_BREAKPOINTS.flatMap((bp) =>
          SPACING_SUFFIXES.map((suffix) => `.${bp}-${prefix}-${suffix}`),
        ),
      ),
    )
    .join(', ');
  const SPACING_CLASS_REGEXP = /^[mp][lr]-((sm|md|lg|xl|xxl)-)?([0-5]|auto)$/;
  observe(SPACING_CLASSES, {
    add(el) {
      el.classList.forEach((cls) => {
        if (!SPACING_CLASS_REGEXP.test(cls)) return;

        const [prefix, suffix] = cls.split('-');
        const newPrefix = SPACING_PREFIX_MAP[prefix];
        if (!newPrefix) return;

        const newClass = `${newPrefix}-${suffix}`;
        if (el.classList.contains(newClass)) return;
        el.classList.add(newClass);

        console.warn(
          `Bootstrap 5 replaced the ${cls} class with the ${newClass} class. Please update your HTML.`,
          el,
        );
      });
    },
  });

  observe('.float-left, .float-right', {
    add(el) {
      if (el.classList.contains('float-left')) {
        el.classList.add('float-start');
        console.warn(
          'Bootstrap 5 replaced .float-left with .float-start. Please update your HTML.',
          el,
        );
      } else {
        el.classList.add('float-end');
        console.warn(
          'Bootstrap 5 replaced .float-right with .float-end. Please update your HTML.',
          el,
        );
      }
    },
  });

  observe('.border-left, .border-right', {
    add(el) {
      if (el.classList.contains('border-left')) {
        el.classList.add('border-start');
        console.warn(
          'Bootstrap 5 replaced .border-left with .border-start. Please update your HTML.',
          el,
        );
      } else {
        el.classList.add('border-end');
        console.warn(
          'Bootstrap 5 replaced .border-right with .border-end. Please update your HTML.',
          el,
        );
      }
    },
  });

  observe('.rounded-left, .rounded-right', {
    add(el) {
      if (el.classList.contains('rounded-left')) {
        el.classList.add('rounded-start');
        console.warn(
          'Bootstrap 5 replaced .rounded-left with .rounded-start. Please update your HTML.',
          el,
        );
      } else {
        el.classList.add('rounded-end');
        console.warn(
          'Bootstrap 5 replaced .rounded-right with .rounded-end. Please update your HTML.',
          el,
        );
      }
    },
  });

  const TEXT_ALIGN_CLASSES = ['left', 'right']
    .flatMap((align) =>
      [`text-${align}`].concat(BOOTSTRAP_BREAKPOINTS.map((bp) => `.text-${bp}-${align}`)),
    )
    .join(', ');
  const TEXT_ALIGN_REGEXP = /^text-(sm|md|lg|xl|xxl)-(left|right)$/;
  observe(TEXT_ALIGN_CLASSES, {
    add(el) {
      Array.from(el.classList)
        .filter((cls) => TEXT_ALIGN_REGEXP.test(cls))
        .forEach((cls) => {
          const classComponents = cls.split('-');
          const newAlignment = classComponents[2] === 'left' ? 'start' : 'end';
          const newClass = `text-${classComponents[1]}-${newAlignment}`;
          if (el.classList.contains(newClass)) return;
          el.classList.add(newClass);

          console.warn(
            `Bootstrap 5 replaced the ${cls} class with the ${newClass} class. Please update your HTML.`,
            el,
          );
        });
    },
  });

  // In Bootstrap 5, elements can be added as direct children of `.input-group`
  // without using a wrapping `.input-group-prepend` or `.input-group-append`.
  // This bit of JavaScript will re-parent the children of `.input-group-*` into
  // the containing `.input-group` element.
  observe('.input-group-prepend, .input-group-append', {
    add(el) {
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

      // Temporarily set `transition` to `none` to prevent an animated color change.
      const originalTransition = el.style.transition;
      el.style.transition = 'none';

      const color = BADGE_COLORS.find((color) => el.classList.contains(`badge-${color}`));
      el.classList.remove(`badge-${color}`);

      // If this element is an anchor or a button, we need to use a different
      // set of classes to support hover/focus styles.
      if (el.tagName === 'A' || el.tagName === 'BUTTON') {
        el.classList.add('btn', `btn-${color}`);
      } else {
        el.classList.add(`text-bg-${color}`);
        console.warn('Bootstrap 5 replaced .badge-* with .text-bg-*. Please update your HTML.', el);
      }

      // Restore the original `transition` value.
      setTimeout(() => (el.style.transition = originalTransition), 0);
    },
  });

  // The `.badge-pill` was replaced by `.rounded-pill`.
  observe('.badge-pill', {
    add(el) {
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
      el.classList.add('font-monospace');
      console.warn(
        'Bootstrap 5 replaced .text-monospace with .font-monospace. Please update your HTML.',
        el,
      );
    },
  });

  observe('.sr-only, .sr-only-focusable', {
    add(el) {
      const hasSrOnly = el.classList.contains('sr-only');
      const hasSrOnlyFocusable = el.classList.contains('sr-only-focusable');

      if (hasSrOnly && hasSrOnlyFocusable) {
        el.classList.add('visually-hidden-focusable');
        console.warn(
          'Bootstrap 5 replaced .sr-only.sr-only-focusable with .visually-hidden-focusable. Please update your HTML.',
          el,
        );
      } else if (hasSrOnly) {
        el.classList.add('visually-hidden');
        console.warn(
          'Bootstrap 5 replaced .sr-only with .visually-hidden. Please update your HTML.',
          el,
        );
      }

      // Normally we'd leave the existing classes in place, but FontAwesome frustratingly
      // ships with their own classes that conflict with Bootstrap's. We'll remove them here.
      el.classList.remove('sr-only', 'sr-only-focusable');
    },
  });

  observe('.form-row', {
    add(el) {
      el.classList.add('row');
      console.warn('Bootstrap 5 replaced .form-row with .row. Please update your HTML.', el);
    },
  });

  observe('button.close', {
    add(el) {
      el.classList.add('btn-close');
      console.warn('Bootstrap 5 replaced .close with .btn-close. Please update your HTML.', el);
    },
  });

  observe('button.close', {
    add(el) {
      if (
        el.children.length !== 1 ||
        el.children[0].tagName !== 'SPAN' ||
        !el.children[0].hasAttribute('aria-hidden') ||
        el.children[0].textContent !== '×'
      ) {
        return;
      }

      el.innerHTML = '';
      console.warn(
        'Bootstrap 5 no longer requires &times; in close buttons. Please update your HTML.',
        el,
      );
    },
  });
});
