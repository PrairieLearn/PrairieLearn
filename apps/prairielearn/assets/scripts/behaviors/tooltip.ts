import { type Tooltip } from 'bootstrap';
import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const openTooltips = new Set<Tooltip>();

function closeOpenTooltips() {
  openTooltips.forEach((tooltip) => tooltip.hide());
  openTooltips.clear();
}

onDocumentReady(() => {
  observe('[data-bs-toggle~="tooltip"], [data-bs-toggle-tooltip="true"]', {
    constructor: HTMLElement,
    add(el) {
      new window.bootstrap.Tooltip(el);

      // Bootstrap doesn't support a single element triggering multiple things.
      // There are cases where we want this behavior, e.g. to have a tooltip
      // label on a button that opens a modal. We achieve that by looking for
      // things like `data-bs-toggle="modal tooltip"` and stripping the `tooltip`
      // piece out after initializing the tooltip.
      const attributeName = el.dataset.toggle ? 'toggle' : 'bsToggle';
      const attribute = el.dataset[attributeName];
      if (attribute && attribute !== 'tooltip') {
        el.dataset[attributeName] = attribute
          .split(' ')
          .filter((x) => x !== 'tooltip')
          .join(' ');

        // If we naively removed the `tooltip` piece, the element would no
        // longer match the selector used by `selector-observer` here, which
        // would cause the tooltip to be disposed. To prevent that, we set
        // `data-bs-toggle-tooltip` to `true`, which is ignored by Bootstrap
        // but allows `selector-observer` to keep the element alive.
        el.dataset.bsToggleTooltip = 'true';
      }

      // By default, Bootstrap will copy the `title` attribute to the `aria-label`
      // attribute if the trigger doesn't have any visible text. It will _also_
      // add an `aria-describedby` attribute that points to the tooltip when it's
      // shown. This is problematic for screen readers, because it means that the
      // screen reader will announce the tooltip's text twice.
      //
      // We define our own convention: if `data-bs-title` is set and the tooltip
      // trigger doesn't have any text content or existing `aria-label`, we'll
      // use the `data-bs-title` as the `aria-label`. We'll also immediately
      // remove the `aria-describedby` attribute when the tooltip is shown.
      if (!el.hasAttribute('aria-label')) {
        const title = el.dataset.bsTitle;
        if (title && !el.textContent.trim()) {
          el.setAttribute('aria-label', title);
        }
        el.addEventListener('inserted.bs.tooltip', () => {
          el.removeAttribute('aria-describedby');
        });
      }
    },
    remove(el) {
      window.bootstrap.Tooltip.getInstance(el)?.dispose();
    },
  });

  // Hide other open tooltips when a new one is shown.
  on('show.bs.tooltip', 'body', () => {
    closeOpenTooltips();
  });

  on('shown.bs.tooltip', 'body', (event) => {
    const tooltip = window.bootstrap.Tooltip.getInstance(event.target as HTMLElement);
    if (tooltip) openTooltips.add(tooltip);
  });

  on('hide.bs.tooltip', 'body', (event) => {
    const tooltip = window.bootstrap.Tooltip.getInstance(event.target as HTMLElement);
    if (tooltip) openTooltips.delete(tooltip);
  });
});
