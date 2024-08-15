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

// We need to wrap this in `onDocumentReady` because Bootstrap doesn't
// add its jQuery API to the jQuery object until after this event.
// `selector-observer` will start running its callbacks immediately, so they'd
// otherwise execute too soon.
onDocumentReady(() => {
  observe('[data-toggle="popover"]', {
    constructor: HTMLElement,
    add(el) {
      // We continue to use the jQuery interface to ensure compatibility with Bootstrap 4.
      $(el).popover({ sanitize: false });
    },
    remove(el) {
      // We continue to use the jQuery interface to ensure compatibility with Bootstrap 4.
      $(el).popover('dispose');

      // There can be race conditions when a popover trigger is removed where
      // Bootstrap seems to lose track of the connection between the open popover
      // and its trigger. To ensure that we aren't left with dangling popovers,
      // we'll forcefully remove the popover container if it exists.
      //
      // TODO: Remove this once we're using the native Bootstrap 5 API.
      const container = getPopoverContainerForTrigger(el);
      if (container) {
        container.remove();
      }
    },
  });

  // Bootstrap supports `data-dismiss="alert"` and `data-dismiss="modal"`, but not
  // `data-dismiss="popover"`. This behavior adds support for dismissing popovers
  // in such a declarative way.
  on('click', '[data-dismiss="popover"]', (event) => {
    const popoverContainer = event.currentTarget.closest('.popover');
    if (!popoverContainer || !(popoverContainer instanceof HTMLElement)) return;

    const trigger = getPopoverTriggerForContainer(popoverContainer);
    if (!trigger) return;

    $(trigger).popover('hide');
  });

  // We continue to use the jQuery API for event handling to ensure compatibility with Bootstrap 4.
  $(document.body).on('show.bs.popover', () => {
    openPopoverTriggers.forEach((popover) => $(popover).popover('hide'));
    openPopoverTriggers.clear();
  });

  $(document.body).on('inserted.bs.popover', (event) => {
    const container = getPopoverContainerForTrigger(event.target);

    // If MathJax is loaded on this page, attempt to typeset any math
    // that may be in the popover.
    if (container && typeof window.MathJax !== 'undefined') {
      window.MathJax.typesetPromise([container]);
    }
  });

  $(document.body).on('shown.bs.popover', (event) => {
    openPopoverTriggers.add(event.target);
  });
});
