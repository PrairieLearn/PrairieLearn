import { Popover } from 'bootstrap';
import { on } from 'delegated-events';

/**
 * By default, Bootstrap popovers click when a user clicks inside the body of a popover. This
 * script changes that behavior so that popovers only close when the user clicks outside the
 * popover or presses the escape key.
 */
let openingPopover: (Popover & { element?: HTMLElement }) | null;
let openPopover: (Popover & { element?: HTMLElement }) | null;

function closeOpenPopovers() {
  openPopover?.hide();
  openPopover = null;
}

// Close open popover if the user hits the escape key.
on('keydown', 'body', (e) => {
  if (e.key === 'Escape') {
    closeOpenPopovers();
  }
});

on('click', '[data-toggle="popover"]', (e: Event) => {
  // If this click occurred on an already-open popover trigger element, close the element.
  let alreadyOpen = false;
  const target = (e.target as HTMLElement).closest('[data-toggle="popover"]') as HTMLElement;
  if (openPopover?.element?.id === target?.id) {
    openPopover?.hide();
    openPopover = null;
    alreadyOpen = true;
    return;
  }
  if (alreadyOpen) return;
  // Create a new popover instance and open it.
  const newPopover = new Popover(target);
  newPopover.show();
  console.log(newPopover);
  openingPopover = newPopover;
});

on('click', 'body', (e: any) => {
  // If this click occurred inside a popover, do nothing.
  if ((e.target as HTMLElement).closest('.popover')) {
    return;
  }

  // Close all open popovers.
  closeOpenPopovers();
  openPopover = openingPopover;
  openingPopover = null;
});
