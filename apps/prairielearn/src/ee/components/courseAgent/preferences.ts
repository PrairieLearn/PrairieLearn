import { useSyncExternalStore } from 'react';
import { z } from 'zod';

const PreferencesSchema = z.object({
  selectedId: z.string().nullable(),
  read: z.record(z.string(), z.string()),
  drafts: z.record(z.string(), z.string()),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
export function readPreferences(key: string): Preferences {
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(key);
      if (stored) return PreferencesSchema.parse(JSON.parse(stored));
    }
  } catch {
    /* Preferences are best effort when browser storage is unavailable. */
  }
  return { selectedId: null, read: {}, drafts: {} };
}
export function writePreferences(key: string, patch: Partial<Preferences>) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...readPreferences(key), ...patch }));
    window.dispatchEvent(new Event('course-agent-preferences'));
  } catch {
    /* Chat still works without saved browser preferences. */
  }
}

function subscribePreferences(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener('course-agent-preferences', notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener('course-agent-preferences', notify);
  };
}

function readStoredPreferences(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function usePreferences(key: string) {
  const stored = useSyncExternalStore(
    subscribePreferences,
    () => readStoredPreferences(key),
    () => null,
  );
  if (stored) {
    try {
      const parsed = PreferencesSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    } catch {
      /* Ignore invalid browser preferences. */
    }
  }
  const empty: Preferences = { selectedId: null, read: {}, drafts: {} };
  return empty;
}
