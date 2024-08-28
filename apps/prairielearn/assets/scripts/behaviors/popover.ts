import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { focusFirstFocusableChild, onDocumentReady, trapFocus } from '@prairielearn/browser-utils';

import { getPopoverContainerForTrigger, getPopoverTriggerForContainer } from '../lib/popover.js';

const openPopoverTriggers = new Set<HTMLElement>();

function closeOpenPopovers() {
  openPopoverTriggers.forEach((popover) => $(popover).popover('hide'));
  openPopoverTriggers.clear();
}

/**
 * Returns the trigger modes for a popover trigger as configured by `data-bs-trigger`,
 * `data-trigger`, or `trigger: ...` in the popover's options.
 *
 * If the trigger mode cannot be determined, an empty array is returned.
 */
function getPopoverTriggerModes(trigger: HTMLElement): string[] {
  // Bootstrap 4 uses jQuery data to store popover configuration.
  const config = $(trigger).data('bs.popover');
  if (config) {
    return config.config?.trigger?.split?.(' ') ?? [];
  }

  // Bootstrap 5 allows us to access the popover instance more directly.
  const instance = window.bootstrap?.Popover?.getInstance?.(trigger);
  if (instance) {
    return (instance as any)._config?.trigger?.split?.(' ') ?? [];
  }

  return [];
}

/**
 * Returns whether a popover trigger is focus-triggered.
 */
function isFocusTrigger(trigger: HTMLElement) {
  const triggerModes = getPopoverTriggerModes(trigger);
  return triggerModes.includes('focus');
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

  // Close open popovers if the user hits the escape key.
  //
  // Note that this does not gracefully handle popovers inside of modals, as
  // Bootstrap has its own escape key handling for modals.
  on('keydown', 'body', (event) => {
    if (event.key === 'Escape') {
      closeOpenPopovers();
    }
  });

  on('click', 'body', (e) => {
    if (openPopoverTriggers.size === 0) return;

    // If this click occurred inside a popover, do nothing.
    const closestPopover = (e.target as HTMLElement).closest('.popover');
    if (closestPopover) return;

    // Close all open popovers.
    closeOpenPopovers();
  });

  // We continue to use the jQuery API for event handling to ensure compatibility with Bootstrap 4.

  // Hide other open popovers when a new popover is opened.
  $(document.body).on('show.bs.popover', () => {
    closeOpenPopovers();
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
    const target = event.target as HTMLElement;

    openPopoverTriggers.add(event.target);

    const container = getPopoverContainerForTrigger(event.target);

    // If the popover is focus-triggered, we'll skip the focus trap and
    // autofocus logic. If we move the focus off the trigger, the popover
    // will immediately close, which we don't want.
    if (container && !isFocusTrigger(target)) {
      // Trap focus inside this new popover.
      const trap = trapFocus(container);

      // Remove focus trap when this popover is ultimately hidden.
      const removeFocusTrap = () => {
        trap.deactivate();
        $(target).off('hide.bs.popover', removeFocusTrap);
      };
      $(target).on('hide.bs.popover', removeFocusTrap);

      // Attempt to place focus on the correct item inside the popover.
      const popoverBody = container.querySelector('.popover-body') as HTMLElement;
      focusFirstFocusableChild(popoverBody);
    }
  });

  $(document.body).on('hide.bs.popover', (event) => {
    openPopoverTriggers.delete(event.target);
  });
});
