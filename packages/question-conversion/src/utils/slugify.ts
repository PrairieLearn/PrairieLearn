/**
 * Convert a string into a URL-safe slug.
 * Replaces non-alphanumeric characters with hyphens, lowercases, and trims.
 */
export function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return cleaned || 'question';
}
