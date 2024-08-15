import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const openPopoverTriggers = new Set<HTMLElement>();

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

    if (el instanceof HTMLElement) {
      // There can be race conditions when a popover trigger is removed where
      // Bootstrap seems to lose track of the connection between the open popover
      // and its trigger. To ensure that we aren't left with dangling popovers,
      // we'll forcefully remove the popover container if it exists.
      const container = getPopoverContainerForTrigger(el);
      if (container) {
        container.remove();
      }
    }
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
    openPopoverTriggers.forEach((popover) => $(popover).popover('hide'));
    openPopoverTriggers.clear();
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
    openPopoverTriggers.add(event.target);
  });
});
