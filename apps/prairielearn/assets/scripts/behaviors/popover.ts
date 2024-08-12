import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const openPopovers = new Set<any>();

function getPopoverContainerForTrigger(trigger: HTMLElement): HTMLElement | null {
  const popoverId = trigger.getAttribute('aria-describedby');
  if (!popoverId) return null;

  const popoverContainer = document.querySelector<HTMLElement>(`#${popoverId}`);
  return popoverContainer;
}

function getPopoverTriggerForContainer(container: HTMLElement): HTMLElement | null {
  const popoverId = container.getAttribute('id');
  if (!popoverId) return null;

  const popoverTrigger = document.querySelector<HTMLElement>(`[aria-describedby="${popoverId}"]`);
  return popoverTrigger;
}

observe('[data-toggle="popover"]', {
  add(el) {
    $(el).popover({ sanitize: false });
  },
  remove(el) {
    $(el).popover('dispose');
  },
});

// Bootstrap supports `data-dismiss="alert"` and `data-dismiss="modal"`, but not
// `data-dismiss="popover"`. This behavior adds support for dismissing popovers
// in such a declarative way.
on('click', '[data-dismiss="popover"]', (event) => {
  const popover = event.currentTarget.closest('.popover');
  if (!popover || !(popover instanceof HTMLElement)) return;

  const trigger = getPopoverTriggerForContainer(popover);
  if (!trigger) return;

  $(trigger).popover('hide');
});

// TODO: In Bootstrap 5, switch to using native events.
onDocumentReady(() => {
  $(document).on('show.bs.popover', () => {
    openPopovers.forEach((popover) => $(popover).popover('hide'));
    openPopovers.clear();
  });

  $(document).on('inserted.bs.popover', (event) => {
    const container = getPopoverContainerForTrigger(event.target);

    // If MathJax is loaded on this page, attempt to typeset any math
    // that may be in the popover.
    if (container && typeof window.MathJax !== 'undefined') {
      window.MathJax.typesetPromise([container]);
    }
  });

  $(document).on('shown.bs.popover', (event) => {
    openPopovers.add(event.target);
  });
});
