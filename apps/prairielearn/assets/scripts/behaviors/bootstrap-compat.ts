import { makeMigrator } from '../lib/bootstrap-compat-utils.js';

console.log('Enabling Bootstrap compatibility layer.');

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

makeMigrator({
  selector: BOOTSTRAP_LEGACY_ATTRIBUTES.map((attr) => `[${attr}]`).join(','),
  migrate(el, { migrateAttribute }) {
    BOOTSTRAP_LEGACY_ATTRIBUTES.forEach((attr) => {
      // `tom-select` uses a `data-content` attribute on `option` elements.
      // This is unrelated to Bootstrap, so we don't want to do anything with this.
      if (attr === 'data-content' && el.tagName === 'OPTION') return;

      if (el.hasAttribute(attr)) {
        migrateAttribute(el, attr, attr.replace('data-', 'data-bs-'));
      }
    });
  },
});

// We used `white text/buttons in "info"-colored card headers, but that doesn't
// provide sufficient contrast in Bootstrap 5. We'll do our best to patch this
// by switching to dark text/buttons in this situation.
makeMigrator({
  selector: '.card-header.bg-info.text-white',
  migrate(el) {
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
  },
});

// *********************
// Content, Reboot, etc.
// *********************

makeMigrator({
  selector: '.thead-light, .thead-dark',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'thead-light', 'table-light');
    migrateClass(el, 'thead-dark', 'table-dark');
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

makeMigrator({
  selector: SPACING_CLASSES,
  migrate(el, { migrateClass }) {
    el.classList.forEach((cls) => {
      if (!SPACING_CLASS_REGEXP.test(cls)) return;

      const [prefix, suffix] = cls.split('-');
      const newPrefix = SPACING_PREFIX_MAP[prefix];
      if (!newPrefix) return;

      const newClass = `${newPrefix}-${suffix}`;
      migrateClass(el, cls, newClass);
    });
  },
});

// *****
// Forms
// *****

makeMigrator({
  selector: '.custom-control.custom-checkbox',
  migrate(el, { addClass }) {
    addClass(
      el,
      'form-check',
      'Bootstrap 5 replaced .custom-control.custom-checkbox with .form-check. Please update your HTML.',
    );

    el.querySelectorAll('.custom-control-input').forEach((input) => {
      addClass(
        input,
        'form-check-input',
        'Bootstrap 5 replaced .custom-control-input with .form-check-input. Please update your HTML.',
      );
    });

    el.querySelectorAll('.custom-control-label').forEach((label) => {
      addClass(
        label,
        'form-check-label',
        'Bootstrap 5 replaced .custom-control-label with .form-check-label. Please update your HTML.',
      );
    });
  },
});

makeMigrator({
  selector: '.custom-control.custom-radio',
  migrate(el, { addClass }) {
    addClass(
      el,
      'form-check',
      'Bootstrap 5 replaced .custom-control.custom-radio with .form-check. Please update your HTML.',
    );

    el.querySelectorAll('.custom-control-input').forEach((input) => {
      addClass(
        input,
        'form-check-input',
        'Bootstrap 5 replaced .custom-control-input with .form-check-input. Please update your HTML.',
      );
    });

    el.querySelectorAll('.custom-control-label').forEach((label) => {
      addClass(
        label,
        'form-check-label',
        'Bootstrap 5 replaced .custom-control-label with .form-check-label. Please update your HTML.',
      );
    });
  },
});

makeMigrator({
  selector: '.custom-control.custom-switch',
  migrate(el, { addClass }) {
    addClass(
      el,
      ['form-check', 'form-switch'],
      'Bootstrap 5 replaced .custom-control.custom-switch with .form-check.form-switch. Please update your HTML.',
    );

    el.querySelectorAll('.custom-control-input').forEach((input) => {
      addClass(
        input,
        'form-check-input',
        'Bootstrap 5 replaced .custom-control-input with .form-check-input. Please update your HTML.',
      );
    });

    el.querySelectorAll('.custom-control-label').forEach((label) => {
      addClass(
        label,
        'form-check-label',
        'Bootstrap 5 replaced .custom-control-label with .form-check-label. Please update your HTML.',
      );
    });
  },
});

makeMigrator({
  selector: '.custom-select',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'custom-select', 'form-select');
  },
});

makeMigrator({
  selector: '.custom-file',
  migrate(el) {
    const input = el.querySelector('input[type="file"]');
    const label = el.querySelector('.custom-file-label');

    // If there's no input or label, there's nothing for us to migrate;
    if (!input || !label) return;

    // Move the label before the input.
    el.insertBefore(label, input);

    // Update the classes.
    label.classList.add('form-label');
    input.classList.add('form-control');

    console.warn('Bootstrap 5 uses new markup for file inputs. Please update your HTML.', el);
  },
});

makeMigrator({
  selector: '.custom-range',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'custom-range', 'form-range');
  },
});

// In Bootstrap 5, elements can be added as direct children of `.input-group`
// without using a wrapping `.input-group-prepend` or `.input-group-append`.
// This bit of JavaScript will re-parent the children of `.input-group-*` into
// the containing `.input-group` element.
makeMigrator({
  selector: '.input-group-prepend, .input-group-append',
  migrate(el) {
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
makeMigrator({
  selector: '.form-group',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'form-group', 'mb-3');
  },
});

makeMigrator({
  selector: '.form-row',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'form-row', 'row');
  },
});

makeMigrator({
  selector: '.form-inline',
  migrate(el, { addClass }) {
    // We historically used `form-inline` incorrectly: we frequently applied it
    // alongside `d-inline-block`. This made `form-inline` a no-op, as `d-inline-block`
    // overrides `display` to `inline-block`, but `form-inline` relies on it being `flex.
    //
    // To ideally handle all cases, we'll only add the equivalent classes if we don't see
    // any other `d-*` classes on the element.
    //
    // This won't handle every potentially strange use here, but it will handle the common
    // case of courses forking core PL elements and dragging our incorrect usage along with them.

    const hasNonFlexDisplayClass = Array.from(el.classList).some(
      (cls) => cls.startsWith('d-') && !cls.startsWith('d-flex'),
    );

    if (hasNonFlexDisplayClass) {
      console.warn('Bootstrap 5 has deprecated .form-inline. Please update your HTML.', el);
      return;
    }

    // We can sorta-kinda emulate the old behavior by using `d-flex.flex-row.flex-wrap`.
    // However, this isn't a complete replacement, as the old class would also impact the
    // styling of its descendants.
    addClass(
      el,
      ['d-flex', 'flex-row', 'flex-wrap', 'align-items-center'],
      'Bootstrap 5 has deprecated .form-inline. Please update your HTML.',
    );
  },
});

// `label` no longer receives a default bottom margin; the `form-label` class
// must be added to form labels.
makeMigrator({
  selector: 'label',
  migrate(el, { addClass }) {
    if (el.closest('.form-group') == null) return;
    if (el.classList.contains('form-check-label')) return;

    addClass(
      el,
      'form-label',
      'Bootstrap 5 requires the .form-label class on form labels. Please update your HTML.',
    );
  },
});

// ********************
// Components -> Badges
// ********************

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
makeMigrator({
  selector: BADGE_SELECTOR,
  migrate(el) {
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
      el.classList.add('btn', 'btn-xs', `btn-${color}`, 'fw-bold');
      el.classList.remove('badge');
      console.warn(
        'Bootstrap 5 no longer supports badge styles on <button> or <a>. Please update your HTML.',
        el,
      );
    } else {
      el.classList.add(`text-bg-${color}`);
      console.warn('Bootstrap 5 replaced .badge-* with .text-bg-*. Please update your HTML.', el);
    }

    // Restore the original `transition` value.
    setTimeout(() => (el.style.transition = originalTransition), 0);
  },
});

// The `.badge-pill` class was replaced by `.rounded-pill`.
makeMigrator({
  selector: '.badge.badge-pill',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'badge-pill', 'rounded-pill');
  },
});

// *********************
// Components -> Buttons
// *********************

makeMigrator({
  selector: '.btn.btn-block',
  migrate(el, { addClass }) {
    addClass(
      el,
      ['d-block', 'w-100'],
      'Bootstrap 5 replaced .btn-block with .d-block.w-100. Please update your HTML.',
    );
  },
});

// **************************
// Components -> Close button
// **************************

makeMigrator({
  selector: 'button.close',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'close', 'btn-close');

    if (
      el.children.length === 1 &&
      el.children[0].tagName === 'SPAN' &&
      el.children[0].hasAttribute('aria-hidden') &&
      el.children[0].textContent === '×'
    ) {
      el.innerHTML = '';
      console.warn(
        'Bootstrap 5 no longer requires &times; in close buttons. Please update your HTML.',
        el,
      );
    }
  },
});

// ***********************
// Components -> Dropdowns
// ***********************

// This isn't documented in the migration guide, but the `.dropdown-menu-left`
// and `.dropdown-menu-right` classes were replaced by `.dropdown-menu-start`
// and `.dropdown-menu-end`, respectively.
makeMigrator({
  selector: '.dropdown-menu-left, .dropdown-menu-right',
  migrate(el, { migrateClass }) {
    if (!el.classList.contains('dropdown-menu')) return [];

    // The version of `bootstrap-table` we're locked to uses the old classname.
    // It was fixed in this PR:
    // https://github.com/wenzhixin/bootstrap-table/pull/6796
    // However, we can't upgrade to that version because of this breaking change:
    // https://github.com/wenzhixin/bootstrap-table/issues/6745
    // For now, we'll just ignore this, since we don't control this markup.
    if (el.closest('.bootstrap-table')) return;

    migrateClass(el, 'dropdown-menu-left', 'dropdown-menu-start');
    migrateClass(el, 'dropdown-menu-right', 'dropdown-menu-end');
  },
});

// *********
// Utilities
// *********

makeMigrator({
  selector: '.float-left, .float-right',
  migrate(el, { migrateClass }) {
    // `bootstrap-table` uses its own implementation of `float-left` and `float-right`.
    if (el.closest('.bootstrap-table')) return;

    migrateClass(el, 'float-left', 'float-start');
    migrateClass(el, 'float-right', 'float-end');
  },
});

makeMigrator({
  selector: '.border-left, .border-right',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'border-left', 'border-start');
    migrateClass(el, 'border-right', 'border-end');
  },
});

makeMigrator({
  selector: '.border-left-0, .border-right-0',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'border-left-0', 'border-start-0');
    migrateClass(el, 'border-right-0', 'border-end-0');
  },
});

makeMigrator({
  selector: '.rounded-left, .rounded-right',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'rounded-left', 'rounded-start');
    migrateClass(el, 'rounded-right', 'rounded-end');
  },
});

const TEXT_ALIGN_CLASSES = ['left', 'right']
  .flatMap((align) =>
    [`.text-${align}`].concat(BOOTSTRAP_BREAKPOINTS.map((bp) => `.text-${bp}-${align}`)),
  )
  .join(', ');
const TEXT_ALIGN_REGEXP = /^text(-(sm|md|lg|xl|xxl))?-(left|right)$/;
makeMigrator({
  selector: TEXT_ALIGN_CLASSES,
  migrate(el, { migrateClass }) {
    Array.from(el.classList)
      .filter((cls) => TEXT_ALIGN_REGEXP.test(cls))
      .forEach((cls) => {
        const classComponents = cls.split('-');
        const newAlignment = classComponents.pop() === 'left' ? 'start' : 'end';
        const newClass = classComponents.join('-') + `-${newAlignment}`;
        migrateClass(el, cls, newClass);
      });
  },
});

makeMigrator({
  selector: '.text-monospace',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'text-monospace', 'font-monospace');
  },
});

const FONT_WEIGHT_CLASSES = [
  'font-weight-bold',
  'font-weight-bolder',
  'font-weight-normal',
  'font-weight-light',
  'font-weight-lighter',
];
makeMigrator({
  selector: FONT_WEIGHT_CLASSES.map((cls) => `.${cls}`).join(', '),
  migrate(el, { migrateClass }) {
    FONT_WEIGHT_CLASSES.forEach((oldClass) => {
      const newClass = oldClass.replace('font-weight', 'fw');
      migrateClass(el, oldClass, newClass);
    });
  },
});

makeMigrator({
  selector: '.font-italic',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'font-italic', 'fst-italic');
  },
});

// *******
// Helpers
// *******

makeMigrator({
  selector:
    '.embed-responsive, .embed-responsive-1by1, .embed-responsive-4by3, .embed-responsive-16by9, .embed-responsive-21by9',
  migrate(el, { migrateClass }) {
    migrateClass(el, 'embed-responsive', 'ratio');
    migrateClass(el, 'embed-responsive-1by1', 'ratio-1x1');
    migrateClass(el, 'embed-responsive-4by3', 'ratio-4x3');
    migrateClass(el, 'embed-responsive-16by9', 'ratio-16x9');
    migrateClass(el, 'embed-responsive-21by9', 'ratio-21x9');
  },
});

makeMigrator({
  selector: '.embed-responsive-item',
  migrate(el) {
    if (!el.parentElement?.classList.contains('embed-responsive')) return;

    console.warn(
      'Bootstrap 5 no longer requires .embed-responsive-item. Please update your HTML.',
      el,
    );
  },
});

makeMigrator({
  selector: '.sr-only, .sr-only-focusable',
  migrate(el, { addClass }) {
    const hasSrOnly = el.classList.contains('sr-only');
    const hasSrOnlyFocusable = el.classList.contains('sr-only-focusable');

    if (hasSrOnly && hasSrOnlyFocusable) {
      addClass(
        el,
        'visually-hidden-focusable',
        'Bootstrap 5 replaced .sr-only.sr-only-focusable with .visually-hidden-focusable. Please update your HTML.',
      );
    } else if (hasSrOnly) {
      addClass(
        el,
        'visually-hidden',
        'Bootstrap 5 replaced .sr-only with .visually-hidden. Please update your HTML.',
      );
    }

    // Normally we'd leave the existing classes in place, but FontAwesome frustratingly
    // ships with their own classes that conflict with Bootstrap's. We'll remove them here.
    el.classList.remove('sr-only', 'sr-only-focusable');
  },
});
