import SearchString from 'search-string';

/**
 * Encodes a path for use in a URL on the client. No path normalization is performed.
 * This is a middle-ground between `encodeURI` and `encodeURIComponent`, in that all characters encoded by
 * `encodeURIComponent` are encoded, but slashes are not encoded.
 *
 * @param originalPath path of the file that is the basis for the encoding
 * @returns Encoded path
 */
export function encodePathNoNormalize(originalPath: string): string {
  try {
    return originalPath.split('/').map(encodeURIComponent).join('/');
  } catch {
    return '';
  }
}

/**
 * Encodes a set of search string entries into a URI component string to be used as a search string query param.
 * @param entries Record of search parameter names and values
 * @returns Encoded query parameter string
 */
export function encodeSearchString(entries: Record<string, string | null | undefined>): string {
  const searchString = SearchString.parse('');
  for (const [entryName, entryValue] of Object.entries(entries)) {
    // Add the new entry to the search string, escaping as necessary
    if (entryValue) {
      searchString.addEntry(entryName, entryValue, false);
    }
  }
  return encodeURIComponent(searchString.toString());
}
