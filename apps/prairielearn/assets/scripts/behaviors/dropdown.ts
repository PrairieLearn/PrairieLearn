import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-bs-toggle="dropdown"]', {
    constructor: HTMLElement,
    add(el) {
      // Bootstrap 5 no longer supports `data-boundary="window"` for dropdowns.
      // While Popper.js supports a `strategy: 'fixed'` option, it is not
      // configurable via a data attribute, so we need to patch the creation of
      // such dropdowns.
      //
      // If the following PR is merged, we can use the attribute instead:
      // https://github.com/twbs/bootstrap/pull/34120
      if (el.dataset.bsBoundary) {
        new window.bootstrap.Dropdown(el, {
          popperConfig(defaultConfig) {
            return {
              ...defaultConfig,
              strategy: 'fixed',
            };
          },
        });
      }

      const dropdownParent = el.closest('.dropdown');
      if (dropdownParent) {
        dropdownParent.addEventListener('hide.bs.dropdown', function (event) {
          // @ts-expect-error -- `clickEvent` is not reflected in types.
          const { clickEvent } = event;

          // If the click occurred on a popover trigger, prevent the dropdown from hiding.
          if (clickEvent?.target.closest('[data-bs-toggle="popover"]')) {
            event.preventDefault();
            return;
          }

          // Sometimes we have dropdown buttons that manually trigger popovers. Since
          // we can't rely on `data-bs-toggle="popover"` to detect these, we also support
          // a `data-bs-toggle-popover` attribute.
          if (clickEvent?.target.closest('[data-bs-toggle-popover]')) {
            event.preventDefault();
            return;
          }

          // If the click occurred inside a popover, prevent the dropdown from hiding.
          if (clickEvent?.target.closest('.popover')) {
            event.preventDefault();
            return;
          }

          // If the current document focus is inside a popover, prevent the dropdown from hiding.
          if (document.activeElement?.closest('.popover')) {
            event.preventDefault();
            return;
          }

          // Hide all associated popovers when the dropdown is hidden.
          dropdownParent
            .querySelectorAll('[data-bs-toggle="popover"]')
            .forEach((popoverTrigger) => {
              window.bootstrap.Popover.getInstance(popoverTrigger)?.hide();
            });
        });
      }
    },
  });
});
