/**
 * File-naming rules for the instructor file browser, safe to bundle into the
 * browser. See `file-browser.ts` for the server-side browse functions.
 */

/**
 * Allowed pattern for renamed or newly created course file paths: path segments
 * of letters, numbers, dashes, and underscores (or `..`), joined by `/`, with an
 * optional extension.
 *
 * It is anchored so it can be used directly with `.test()`. The same anchored
 * source also works as an HTML input `pattern` attribute (via `.source`), since
 * the browser already requires the pattern to match the entire value.
 */
export const FILE_NAME_PATTERN =
  /^(?:[A-Za-z0-9_-]+|\.\.)(?:\/(?:[A-Za-z0-9_-]+|\.\.))*(?:\.[A-Za-z0-9_-]+)?$/;

/**
 * Help text describing how to name a file, for renames that can move a file
 * anywhere in the course tree.
 */
export const FILE_NAME_PATTERN_DESCRIPTION_WITH_PARENT_DIR =
  'Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is recommended, delimited by a period. To move the file to a different directory, specify a relative path delimited by forward slashes. Use ".." to refer to the parent directory.';
