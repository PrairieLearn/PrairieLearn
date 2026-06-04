/**
 * Deduplicates an array of entries by their `name` property, keeping the last
 * occurrence of each duplicate. Returns the deduplicated list and the set of
 * names that had duplicates.
 */
export function deduplicateByName<T extends { name: string }>(
  entries: T[],
  defaults?: T[],
): { entries: T[]; duplicates: Set<string> } {
  const known = new Map<string, T>();
  const duplicates = new Set<string>();

  for (const entry of entries) {
    if (known.has(entry.name)) {
      duplicates.add(entry.name);
    }
    known.set(entry.name, entry);
  }

  if (defaults) {
    for (const defaultEntry of defaults) {
      if (!known.has(defaultEntry.name)) {
        known.set(defaultEntry.name, defaultEntry);
      }
    }
  }

  return { entries: [...known.values()], duplicates };
}
