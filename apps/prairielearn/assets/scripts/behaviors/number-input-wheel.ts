import { on } from 'delegated-events';

let activeNumberInput: HTMLInputElement | null = null;

function blurNumberInputOnWheel(event: WheelEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}

function removeWheelListener(input: HTMLInputElement) {
  input.removeEventListener('wheel', blurNumberInputOnWheel);
  input.removeEventListener('blur', removeWheelListenerOnBlur);
  if (activeNumberInput === input) activeNumberInput = null;
}

function removeWheelListenerOnBlur(event: FocusEvent) {
  removeWheelListener(event.currentTarget as HTMLInputElement);
}

/**
 * Work around a Chrome bug where scrolling the page over a focused native
 * number input can also step the input value when a passive wheel listener is
 * present elsewhere on the page.
 *
 * https://issues.chromium.org/issues/516844151
 *
 * We delegate `focusin`, not `wheel`, so dynamically inserted inputs are covered
 * without installing a document-level wheel listener. Once a number input is
 * focused, we attach one passive wheel listener to that input and remove it on
 * blur.
 *
 * TODO: Remove once a fix has shipped and had time to reach users.
 */
on('focusin', 'input[type="number"]', (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;

  if (activeNumberInput && activeNumberInput !== input) {
    removeWheelListener(activeNumberInput);
  }
  if (activeNumberInput === input) return;

  input.addEventListener('wheel', blurNumberInputOnWheel, { passive: true });
  input.addEventListener('blur', removeWheelListenerOnBlur);
  activeNumberInput = input;
});
