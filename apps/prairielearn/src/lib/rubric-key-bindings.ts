/**
 * Keyboard shortcuts for selecting rubric items while grading. Instructors can
 * choose an item's key; every other item gets the next free digit in item
 * order (1–9, then 0), and items past the last free digit get no key.
 */

/** Keys the grading panel already uses for its own shortcuts. */
export const RESERVED_GRADING_KEYS: Record<string, string> = {
  a: 'adding an adjustment',
  f: 'the feedback box',
  g: 'submitting the grade',
  n: 'the next submission',
};

const AUTOMATIC_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** Stored keys are lowercase; an empty value means "use the automatic key". */
export function normalizeKeyBinding(value: string | null | undefined): string | null {
  const key = value?.trim().toLowerCase() ?? '';
  return key === '' ? null : key;
}

/**
 * Checks the custom keys of a rubric's rows, given in item order with `null`
 * for rows without one. Returns an error message for each row, or `null` if
 * its key is fine.
 */
export function customKeyBindingErrors(keys: (string | null)[]): (string | null)[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (key != null) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => {
    if (key == null) return null;
    if (!/^[a-z0-9]$/.test(key)) return 'Use a single letter or digit.';
    if (key in RESERVED_GRADING_KEYS) {
      return `"${key.toUpperCase()}" is used for ${RESERVED_GRADING_KEYS[key]}.`;
    }
    if ((counts.get(key) ?? 0) > 1) return `"${key.toUpperCase()}" is used by another item.`;
    return null;
  });
}

/**
 * The key for each row, given each row's custom key (or `null`). Groups never
 * have a key. Custom keys must already be valid.
 */
export function assignKeyBindings(
  rows: { isGroup: boolean; customKey: string | null }[],
): (string | null)[] {
  const taken = new Set(rows.flatMap((row) => (row.customKey == null ? [] : [row.customKey])));
  const free = AUTOMATIC_KEYS.filter((key) => !taken.has(key));
  return rows.map((row) => {
    if (row.isGroup) return null;
    return row.customKey ?? free.shift() ?? null;
  });
}
