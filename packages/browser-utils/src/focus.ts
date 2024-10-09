// Borrowed from Bootstrap:
// https://github.com/twbs/bootstrap/blob/5f75413735d8779aeefe0097af9dc5a416208ae5/js/src/dom/selector-engine.js#L67
const FOCUSABLE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'details',
  '[tabindex]',
  '[contenteditable="true"]',
]
  .map((selector) => `${selector}:not([tabindex^="-"]):not(.btn-close)`)
  .join(',');

function isElement(object: Element) {
  return typeof object?.nodeType !== 'undefined';
}

function isVisible(element: Element) {
  if (!isElement(element) || element.getClientRects().length === 0) {
    return false;
  }

  const elementIsVisible = getComputedStyle(element).getPropertyValue('visibility') === 'visible';
  // Handle `details` element as its content may falsly appear visible when it is closed
  const closedDetails = element.closest('details:not([open])');

  if (!closedDetails) {
    return elementIsVisible;
  }

  if (closedDetails !== element) {
    const summary = element.closest('summary');
    if (summary && summary.parentNode !== closedDetails) {
      return false;
    }

    if (summary === null) {
      return false;
    }
  }

  return elementIsVisible;
}

function isDisabled(element: Element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }

  if (typeof (element as any).disabled !== 'undefined') {
    return (element as any).disabled;
  }

  return element.hasAttribute('disabled') && element.getAttribute('disabled') !== 'false';
}

function focusableChildren(element: Element): HTMLElement[] {
  const focusableChildren = element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(focusableChildren).filter((child) => !isDisabled(child) && isVisible(child));
}

export interface FocusTrap {
  deactivate(): void;
}

export function trapFocus(element: Element): FocusTrap {
  // Store the previous active element so we can restore it later.
  const previousActiveElement = document.activeElement ?? document.body;

  function keyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    const focusable = focusableChildren(element);
    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Tabbing backwards
      if (document.activeElement === firstFocusable) {
        (focusable[focusable.length - 1] as HTMLElement).focus();
        e.preventDefault();
      }
    } else {
      // Tabbing forwards
      if (document.activeElement === lastFocusable) {
        (focusable[0] as HTMLElement).focus();
        e.preventDefault();
      }
    }
  }

  document.addEventListener('keydown', keyDown);

  return {
    deactivate() {
      document.removeEventListener('keydown', keyDown);
      (previousActiveElement as HTMLElement)?.focus();
    },
  };
}

export function focusFirstFocusableChild(el: HTMLElement) {
  // In case the user (or more frequently, Cypress) is too fast and focuses a
  // specific element inside the container before this script runs, don't transfer
  // focus to a different element.
  if (el.contains(document.activeElement)) return;

  // Escape hatch: if the first element isn't the one that should be focused,
  // add the `autofocus` attribute to the element that should be.
  const autofocusElement = el.querySelector<HTMLElement>('[autofocus]');
  if (autofocusElement) {
    autofocusElement.focus();
    return;
  }

  const focusablePopoverChildren = focusableChildren(el);
  if (focusablePopoverChildren.length > 0) {
    focusablePopoverChildren[0].focus();
    return;
  }

  // If we still couldn't find a child element, focus the container itself.
  el.focus();
}
