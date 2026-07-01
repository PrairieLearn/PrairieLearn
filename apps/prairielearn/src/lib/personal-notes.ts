/**
 * Returns a display filename that does not collide with any name
 */
export function getAvailableFilename(desired: string, existingNames: Iterable<string>): string {
  const taken = new Set(existingNames);
  if (!taken.has(desired)) return desired;

  const dot = desired.lastIndexOf('.');
  const hasExt = dot > 0;
  const stem = hasExt ? desired.slice(0, dot) : desired;
  const ext = hasExt ? desired.slice(dot) : '';

  const base = stem.replace(/\d+$/, '') || stem;

  for (let n = 2; ; n++) {
    const candidate = `${base}${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
