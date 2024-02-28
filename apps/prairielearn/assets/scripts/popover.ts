import { onDocumentReady } from '@prairielearn/browser-utils';
import { on } from 'delegated-events';

/**
 * By default, Bootstrap popovers click when a user clicks inside the body of a popover. This
 * script changes that behavior so that popovers only close when the user clicks outside the
 * popover or presses the escape key.
 */

let openPopoverTrigger: HTMLElement | null;

function closeOpenPopovers() {
  if (openPopoverTrigger) {
    $(openPopoverTrigger).popover('hide');
    openPopoverTrigger = null;
  }
}

onDocumentReady(() => {
  // Close open popover if the user hits the escape key.
  on('keydown', 'body', (e) => {
    if (e.key === 'Escape') {
      closeOpenPopovers();
    }
  });

  $('[data-toggle="popover"]').on('shown.bs.popover', (e) => {
    openPopoverTrigger = e.currentTarget as HTMLElement;
  });

  on('click', 'body', (e: any) => {
    // If this click occurred inside a popover, do nothing.
    if ((e.target as HTMLElement).closest('.popover')) {
      return;
    }

    closeOpenPopovers();
  });
});
