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
  return object?.nodeType !== undefined;
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

  if ((element as any).disabled !== undefined) {
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
      if (isSameFocusContext(document.activeElement, firstFocusable)) {
        focusElementOrCheckedOption(focusable[focusable.length - 1]);
        e.preventDefault();
      }
    } else {
      // Tabbing forwards
      if (isSameFocusContext(document.activeElement, lastFocusable)) {
        focusElementOrCheckedOption(focusable[0]);
        e.preventDefault();
      }
    }
  }

  document.addEventListener('keydown', keyDown);

  return {
    deactivate() {
      document.removeEventListener('keydown', keyDown);
      // Restore focus to the previously active element, but only if focus is
      // currently inside the trap container.
      if (element.contains(document.activeElement)) {
        focusElementOrCheckedOption(previousActiveElement as HTMLElement, { preventScroll: true });
      }
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
    focusElementOrCheckedOption(focusablePopoverChildren[0]);
    return;
  }

  // If we still couldn't find a child element, focus the container itself.
  el.focus();
}

/**
 * Focus on the element, or if it's a radio button, focus on the checked radio button in the same group.
 */
export function focusElementOrCheckedOption(element: HTMLElement, focusOptions?: FocusOptions) {
  // If the element receiving focus is a radio button, and there is another
  // radio button in the same group that is currently checked, focus on that one
  // instead.
  // https://www.w3.org/WAI/ARIA/apg/patterns/radio/
  if (element.tagName === 'INPUT') {
    const inputElement = element as HTMLInputElement;
    if (inputElement.type === 'radio' && inputElement.name) {
      const checkedRadio = element
        .closest('form')
        ?.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(inputElement.name)}"]:checked`,
        );
      if (checkedRadio) {
        checkedRadio.focus(focusOptions);
        return;
      }
    }
  }

  // Otherwise, just focus on the element itself.
  element.focus(focusOptions);
}

/**
 * Check if two elements are in the same focus context. This is true if they are the
 * same element, or if they are radio buttons in the same group.
 */
export function isSameFocusContext(element1: Element | null, element2: Element | null) {
  if (!element1 || !element2) return false;
  if (element1 === element2) return true;
  if (element1.tagName === 'INPUT' && element2.tagName === 'INPUT') {
    const input1 = element1 as HTMLInputElement;
    const input2 = element2 as HTMLInputElement;
    if (input1.type === 'radio' && input2.type === 'radio' && input1.name === input2.name) {
      return true;
    }
  }
  return false;
}
