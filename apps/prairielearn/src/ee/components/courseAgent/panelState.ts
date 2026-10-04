import { useSyncExternalStore } from 'react';

const fallback = new Map<string, string>();
export function readPanelState(key: string) {
  try {
    return sessionStorage.getItem(key) ?? fallback.get(key) ?? '';
  } catch {
    return fallback.get(key) ?? '';
  }
}
export function savePanelState(key: string, value: string) {
  fallback.set(key, value);
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* Keep the panel usable in memory when browser storage is unavailable. */
  }
  window.dispatchEvent(new Event('course-agent-panel-change'));
}

function subscribe(listener: () => void) {
  window.addEventListener('course-agent-panel-change', listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('course-agent-panel-change', listener);
    window.removeEventListener('storage', listener);
  };
}
export function usePanelState(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readPanelState(key),
    () => '',
  );
}
