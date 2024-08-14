import type { Popover } from 'bootstrap';
import { on } from 'delegated-events';
import { observe } from 'selector-observer';

const openPopoverTriggers = new Set<Popover>();

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

on('show.bs.popover', 'body', () => {
  openPopoverTriggers.forEach((popover) => popover.hide());
  openPopoverTriggers.clear();
});

on('inserted.bs.popover', 'body', (event) => {
  const container = getPopoverContainerForTrigger(event.target as HTMLElement);

  // If MathJax is loaded on this page, attempt to typeset any math
  // that may be in the popover.
  if (container && typeof window.MathJax !== 'undefined') {
    window.MathJax.typesetPromise([container]);
  }
});

on('shown.bs.popover', 'body', (event) => {
  const popover = window.bootstrap.Popover.getInstance(event.target as HTMLElement);
  if (popover) {
    openPopoverTriggers.add(popover);
  }
});
