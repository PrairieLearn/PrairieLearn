import { observe } from 'selector-observer';

// TODO: we may need to add a lot more attributes to this list. For tooltips,
// popovers, and maybe more, all options can be controlled by kebab-case data
// attributes, so we probably have to support all of them.
// The following list of attributes was compiled from the Bootstrap 4 docs:
// https://getbootstrap.com/docs/4.6/components/carousel/
// https://getbootstrap.com/docs/4.6/components/dropdowns/
// https://getbootstrap.com/docs/4.6/components/modal/
// https://getbootstrap.com/docs/4.6/components/popovers/
// https://getbootstrap.com/docs/4.6/components/scrollspy/
// https://getbootstrap.com/docs/4.6/components/tooltips/
// https://getbootstrap.com/docs/4.6/components/toasts/
const BOOTSTRAP_LEGACY_ATTRIBUTES = [
  'data-animation',
  'data-autohide',
  'data-backdrop',
  'data-boundary',
  'data-container',
  'data-content',
  'data-custom-class',
  'data-delay',
  'data-dismiss',
  'data-display',
  'data-fallback-placement',
  'data-flip',
  'data-focus',
  'data-interval',
  'data-keyboard',
  'data-html',
  'data-offset',
  'data-pause',
  'data-placement',
  'data-popper-config',
  'data-reference',
  'data-ride',
  'data-selector',
  'data-show',
  'data-spy',
  'data-target',
  'data-template',
  'data-title',
  'data-toggle',
  'data-touch',
  'data-trigger',
  'data-wrap',
];

const BOOTSTRAP_BREAKPOINTS = ['sm', 'md', 'lg', 'xl', 'xxl'];

// The changes here are made based on the Bootstrap 5 migration guide:
// https://getbootstrap.com/docs/5.3/migration/

observe(BOOTSTRAP_LEGACY_ATTRIBUTES.map((attr) => `[${attr}]`).join(','), {
  add(el) {
    BOOTSTRAP_LEGACY_ATTRIBUTES.forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val) {
        // We need to manually handle `data-boundary="window"` since it no longer works
        // in Bootstrap 5.
        // See https://github.com/twbs/bootstrap/issues/34110#issuecomment-1064395197.
        if (attr === 'data-boundary' && val === 'window') {
          return;
        }
        const attrSuffix = attr.replace('data-', '');
        el.setAttribute(`data-bs-${attrSuffix}`, val);
      }
    });
  },
});

// Bootstrap 5 no longer supports `data-boundary="window"` for dropdowns.
// While Popper.js supports a `strategy: 'fixed'` option, it is not
// configurable via a data attribute, so we need to patch the creation of
// such dropdowns.
//
// If the following PR is merged, we can use the attribute instead:
// https://github.com/twbs/bootstrap/pull/34120
//
// Note that we only handle dropdowns here; we don't want to take over the
// creation of poppers and tooltips.
observe('[data-toggle="dropdown"][data-boundary="window"]', {
  add(el) {
    $(el).dropdown({
      popperConfig(defaultConfig) {
        return {
          ...defaultConfig,
          strategy: 'fixed',
        };
      },
    });
  },
});

// We used `white text/buttons in "info"-colored card headers, but that doesn't
// provide sufficient contrast in Bootstrap 5. We'll do our best to patch this
// by switching to dark text/buttons in this situation.
observe('.card-header.bg-info', {
  add(el) {
    if (el.classList.contains('text-white')) {
      el.classList.remove('text-white');
      el.classList.add('text-dark');
      console.warn(
        'Bootstrap 5 no longer provides sufficient contrast for white text on "info"-colored card headers. Please update your HTML.',
        el,
      );

      el.querySelectorAll(':scope > .btn.btn-outline-light').forEach((button) => {
        button.classList.remove('btn-outline-light');
        button.classList.add('btn-outline-dark');
        console.warn(
          'Bootstrap 5 no longer provides sufficient contrast for white buttons on "info"-colored card headers. Please update your HTML.',
          button,
        );
      });
    }
  },
});

// *********************
// Content, Reboot, etc.
// *********************

observe('.thead-light, .thead-dark', {
  add(el) {
    if (el.classList.contains('thead-light')) {
      el.classList.add('table-light');
      console.warn(
        'Bootstrap 5 replaced .thead-light with .table-light. Please update your HTML.',
        el,
      );
    } else {
      el.classList.add('table-dark');
      console.warn(
        'Bootstrap 5 replaced .thead-dark with .table-dark. Please update your HTML.',
        el,
      );
    }
  },
});

// ***
// RTL
// ***

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

// *****
// Forms
// *****

observe('.custom-control.custom-checkbox', {
  add(el) {
    el.classList.add('form-check');
    console.warn(
      'Bootstrap 5 replaced .custom-control.custom-checkbox with .form-check. Please update your HTML.',
      el,
    );

    el.querySelectorAll('.custom-control-input').forEach((input) => {
      input.classList.add('form-check-input');
      console.warn(
        'Bootstrap 5 replaced .custom-control-input with .form-check-input. Please update your HTML.',
        input,
      );
    });

    el.querySelectorAll('.custom-control-label').forEach((label) => {
      label.classList.add('form-check-label');
      console.warn(
        'Bootstrap 5 replaced .custom-control-label with .form-check-label. Please update your HTML.',
        label,
      );
    });
  },
});

observe('.custom-control.custom-radio', {
  add(el) {
    el.classList.add('form-check');
    console.warn(
      'Bootstrap 5 replaced .custom-control.custom-radio with .form-check. Please update your HTML.',
      el,
    );

    el.querySelectorAll('.custom-control-input').forEach((input) => {
      input.classList.add('form-check-input');
      console.warn(
        'Bootstrap 5 replaced .custom-control-input with .form-check-input. Please update your HTML.',
        input,
      );
    });

    el.querySelectorAll('.custom-control-label').forEach((label) => {
      label.classList.add('form-check-label');
      console.warn(
        'Bootstrap 5 replaced .custom-control-label with .form-check-label. Please update your HTML.',
        label,
      );
    });
  },
});

observe('.custom-control.custom-switch', {
  add(el) {
    el.classList.add('form-check', 'form-switch');
    console.warn(
      'Bootstrap 5 replaced .custom-control.custom-switch with .form-check.form-switch. Please update your HTML.',
      el,
    );

    el.querySelectorAll('.custom-control-input').forEach((input) => {
      input.classList.add('form-check-input');
      console.warn(
        'Bootstrap 5 replaced .custom-control-input with .form-check-input. Please update your HTML.',
        input,
      );
    });

    el.querySelectorAll('.custom-control-label').forEach((label) => {
      label.classList.add('form-check-label');
      console.warn(
        'Bootstrap 5 replaced .custom-control-label with .form-check-label. Please update your HTML.',
        label,
      );
    });
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

observe('.custom-file', {
  add(el) {
    const input = el.querySelector('input[type="file"]');
    const label = el.querySelector('.custom-file-label');

    if (!input || !label) {
      console.warn('Could not find input and label in .custom-file.', el);
      return;
    }

    // Move the label before the input.
    el.insertBefore(label, input);

    // Update the classes.
    label.classList.add('form-label');
    input.classList.add('form-control');

    console.warn('Bootstrap 5 uses new markup for file inputs. Please update your HTML.', el);
  },
});

observe('.custom-range', {
  add(el) {
    el.classList.add('form-range');

    console.warn(
      'Bootstrap 5 replaced the .custom-range class with .form-range. Please update your HTML.',
      el,
    );
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

observe('.form-row', {
  add(el) {
    el.classList.add('row');
    console.warn('Bootstrap 5 replaced .form-row with .row. Please update your HTML.', el);
  },
});

// WIP Wednesday, August 7, 2024: stopped after `.custom-range` in the migration guide.

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
      // TODO: log something useful to the console.
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
