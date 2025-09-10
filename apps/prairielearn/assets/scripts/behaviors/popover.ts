import { type Popover } from 'bootstrap';
import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { focusFirstFocusableChild, onDocumentReady, trapFocus } from '@prairielearn/browser-utils';

import { getPopoverContainerForTrigger, getPopoverTriggerForContainer } from '../lib/popover.js';

const openPopovers = new Set<Popover>();

function closeOpenPopovers() {
  openPopovers.forEach((popover) => popover.hide());
  openPopovers.clear();
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

      // Bootstrap will by default copy the `title` attribute to `aria-label`,
      // but it won't do that for `data-bs-title`. We do that here in the interest
      // of making things maximally accessible by default. If an `aria-label`
      // attribute is already present, we leave it alone.
      if (!el.hasAttribute('aria-label')) {
        const title = el.dataset.bsTitle;
        if (title && !el.textContent?.trim()) {
          el.setAttribute('aria-label', title);
        }
      }
    },
    remove(el) {
      window.bootstrap.Popover.getInstance(el)?.dispose();
    },
  });

  // Bootstrap supports `data-bs-dismiss="alert"` and `data-bs-dismiss="modal"`, but not
  // `data-bs-dismiss="popover"`. This behavior adds support for dismissing popovers
  // in such a declarative way.
  on('click', '[data-bs-dismiss="popover"]', (event) => {
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
    if (openPopovers.size === 0) return;

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
    if (container && window.MathJax !== undefined) {
      window.MathJax.typesetPromise([container]);
    }
  });

  on('shown.bs.popover', 'body', (event) => {
    const target = event.target as HTMLElement;

    const popover = window.bootstrap.Popover.getInstance(target);
    if (popover) openPopovers.add(popover);

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
      const popoverBody = container.querySelector<HTMLElement>('.popover-body')!;
      focusFirstFocusableChild(popoverBody);
    }
  });

  on('hide.bs.popover', 'body', (event) => {
    const popover = window.bootstrap.Popover.getInstance(event.target as HTMLElement);
    if (popover) openPopovers.delete(popover);
  });
});
