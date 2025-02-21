import { type Popover } from 'bootstrap';
import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { focusFirstFocusableChild, onDocumentReady, trapFocus } from '@prairielearn/browser-utils';

import { getPopoverContainerForTrigger, getPopoverTriggerForContainer } from '../lib/popover.js';

const openPopoverTriggers = new Set<Popover>();

function closeOpenPopovers() {
  openPopoverTriggers.forEach((popover) => popover.hide());
  openPopoverTriggers.clear();
}

/**
 * Returns the trigger modes for a popover trigger as configured by `data-bs-trigger`,
 * `data-trigger`, or `trigger: ...` in the popover's options.
 *
 * If the trigger mode cannot be determined, an empty array is returned.
 */
function getPopoverTriggerModes(trigger: HTMLElement): string[] {
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
  observe('[data-bs-toggle="popover"]', {
    constructor: HTMLElement,
    add(el) {
      new window.bootstrap.Popover(el, { sanitize: false });
    },
    remove(el) {
      window.bootstrap.Popover.getInstance(el)?.dispose();
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

    window.bootstrap.Popover.getInstance(trigger)?.hide();
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

  // Hide other open popovers when a new popover is opened.
  on('show.bs.popover', 'body', () => {
    closeOpenPopovers();
  });

  on('inserted.bs.popover', 'body', (event) => {
    const target = event.target as HTMLElement;
    const container = getPopoverContainerForTrigger(target);

    // If MathJax is loaded on this page, attempt to typeset any math
    // that may be in the popover.
    if (container && typeof window.MathJax !== 'undefined') {
      window.MathJax.typesetPromise([container]);
    }
  });

  on('shown.bs.popover', 'body', (event) => {
    const target = event.target as HTMLElement;

    const popoverInstance = window.bootstrap.Popover.getInstance(target);
    if (popoverInstance) {
      openPopoverTriggers.add(popoverInstance);
    }

    const container = getPopoverContainerForTrigger(target);

    // If the popover is focus-triggered, we'll skip the focus trap and
    // autofocus logic. If we move the focus off the trigger, the popover
    // will immediately close, which we don't want.
    if (container && !isFocusTrigger(target)) {
      // Trap focus inside this new popover.
      const trap = trapFocus(container);

      // Remove focus trap when this popover is ultimately hidden.
      const removeFocusTrap = () => {
        trap.deactivate();
        target.removeEventListener('hide.bs.popover', removeFocusTrap);
      };
      target.addEventListener('hide.bs.popover', removeFocusTrap);

      // Attempt to place focus on the correct item inside the popover.
      const popoverBody = container.querySelector('.popover-body') as HTMLElement;
      focusFirstFocusableChild(popoverBody);
    }
  });

  on('hide.bs.popover', 'body', (event) => {
    const popoverInstance = window.bootstrap.Popover.getInstance(event.target as HTMLElement);
    if (popoverInstance) {
      openPopoverTriggers.delete(popoverInstance);
    }
  });
});
