// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { trackQuestionFormChanges } from './confirm-on-unload.js';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('reports typed and programmatic answer changes, and clears them on submit', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <form>
      <input name="typed" />
      <input type="hidden" name="stored" value="a" />
      <input type="hidden" name="__csrf_token" value="token" />
    </form>
  `;
  const form = document.querySelector('form')!;
  const typed = form.querySelector<HTMLInputElement>('[name="typed"]')!;
  const stored = form.querySelector<HTMLInputElement>('[name="stored"]')!;
  const onChange = vi.fn();
  const stop = trackQuestionFormChanges(form, onChange);
  await vi.runAllTimersAsync();
  expect(onChange).not.toHaveBeenCalled();

  typed.value = '42';
  typed.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.runAllTimersAsync();
  expect(onChange).toHaveBeenLastCalledWith(true);

  typed.value = '';
  typed.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.runAllTimersAsync();
  expect(onChange).toHaveBeenLastCalledWith(false);

  stored.value = 'b';
  await vi.runAllTimersAsync();
  expect(onChange).toHaveBeenLastCalledWith(true);

  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.runAllTimersAsync();
  expect(onChange).toHaveBeenLastCalledWith(false);
  expect(onChange).toHaveBeenCalledTimes(4);
  stop();
});
