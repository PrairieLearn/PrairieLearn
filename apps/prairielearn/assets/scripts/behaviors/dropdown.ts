import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  observe('[data-toggle="dropdown"]', {
    add(el) {
      const dropdownParent = el.closest('.dropdown');
      if (dropdownParent) {
        $(dropdownParent).on('hide.bs.dropdown', function (event) {
          // @ts-expect-error -- `clickEvent` is not reflected in types.
          const { clickEvent } = event;

          // If the click occurred on a popover trigger, prevent the dropdown from hiding.
          if (clickEvent?.target.closest('[data-toggle="popover"]')) {
            event.preventDefault();
            return;
          }

          // Sometimes we have dropdown buttons that manually trigger popovers. Since
          // we can't rely on `data-toggle="popover"` to detect these, we also support
          // a `data-bs-toggles-popover` attribute.
          if (clickEvent?.target.closest('[data-bs-toggle-popover]')) {
            event.preventDefault();
            return;
          }

          // If the click occurred inside a popover, prevent the dropdown from hiding.
          if (clickEvent?.target.closest('.popover')) {
            event.preventDefault();
            return;
          }

          // Hide all associated popovers when the dropdown is hidden.
          $(dropdownParent).find('[data-toggle="popover"]').popover('hide');
        });
      }
    },
  });
});
