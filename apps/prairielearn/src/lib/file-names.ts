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
