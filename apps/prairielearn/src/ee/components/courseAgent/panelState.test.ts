import { afterEach, expect, test, vi } from 'vitest';

import { readPanelState, savePanelState } from './panelState.js';

afterEach(() => vi.unstubAllGlobals());

test('keeps the latest draft when storage is full until a later write succeeds', () => {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => values.set(key, value));
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem });
  vi.stubGlobal('window', new EventTarget());
  savePanelState('quota-test', 'First draft');
  setItem.mockImplementationOnce(() => {
    throw new Error('QuotaExceededError');
  });
  savePanelState('quota-test', 'Latest draft');
  expect(values.get('quota-test')).toBe('First draft');
  expect(readPanelState('quota-test')).toBe('Latest draft');
  savePanelState('quota-test', 'Saved draft');
  values.set('quota-test', 'Another storage writer');
  expect(readPanelState('quota-test')).toBe('Another storage writer');
});
