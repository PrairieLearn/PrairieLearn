/**
 * Regular expression for validating short names, including course instance short names and QIDs.
 *
 * Dots are allowed in non-leading positions of each path segment (e.g., `foo.bar` or `foo/bar.baz`
 * are valid, but `.foo` or `foo/.bar` are not).
 *
 * TODO: Use the `v` flag to ensure this matches the behavior of browsers when this is used in the pattern attribute once we are on ES2024.
 */
export const SHORT_NAME_REGEX =
  /^[A-Za-z0-9\-_][A-Za-z0-9\-_.]*(\/[A-Za-z0-9\-_][A-Za-z0-9\-_.]*)*$/;

/**
 * String pattern for short names, suitable for use in HTML pattern attributes.
 * Derived from SHORT_NAME_REGEX to maintain a single source of truth.
 */
export const SHORT_NAME_PATTERN = SHORT_NAME_REGEX.source;

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
 * Help text describing how to name a file. Internal building block for
 * {@link FILE_NAME_PATTERN_DESCRIPTION_WITH_PARENT_DIR}; see
 * {@link QUESTION_FILE_NAME_PATTERN_DESCRIPTION} for the question-scoped variant.
 */
const FILE_NAME_PATTERN_DESCRIPTION =
  'Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is recommended, delimited by a period. To move the file to a different directory, specify a relative path delimited by forward slashes.';

/**
 * Used by the instructor file browser, where a rename
 * can move a file anywhere in the course tree.
 */
export const FILE_NAME_PATTERN_DESCRIPTION_WITH_PARENT_DIR = `${FILE_NAME_PATTERN_DESCRIPTION} Use ".." to refer to the parent directory.`;

/**
 * Like {@link FILE_NAME_PATTERN}, but without the `..` parent-directory segment.
 * Used by the draft question file editor, where files must stay inside the
 * question directory: the server's `ModifiableQuestionFilePathSchema` rejects a
 * path containing `..`, so the client form must reject it too. Anchored for use
 * with `.test()`.
 */
export const QUESTION_FILE_NAME_PATTERN =
  /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.[A-Za-z0-9_-]+)?$/;

/**
 * Help text for {@link QUESTION_FILE_NAME_PATTERN}. Unlike
 * {@link FILE_NAME_PATTERN_DESCRIPTION_WITH_PARENT_DIR}, it describes placing a
 * file in a subdirectory rather than moving it elsewhere, since a draft question
 * file cannot escape the question directory.
 */
export const QUESTION_FILE_NAME_PATTERN_DESCRIPTION =
  'Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is recommended, delimited by a period. To place the file in a subdirectory, specify a relative path delimited by forward slashes.';

interface ShortNameValidationSuccess {
  valid: true;
}

interface ShortNameValidationFailure {
  valid: false;
  /** "Cannot start with a slash" - for client display */
  message: string;
  /** "cannot start with a slash" - for server to prepend entity name */
  lowercaseMessage: string;
}

type ShortNameValidationResult = ShortNameValidationSuccess | ShortNameValidationFailure;

function buildValidationError(message: string): ShortNameValidationFailure {
  // Client message starts with capital, server message starts with lowercase
  return {
    valid: false,
    message,
    lowercaseMessage: message.charAt(0).toLowerCase() + message.slice(1),
  };
}

/**
 * Validates a short name and returns a detailed error message if invalid.
 *
 * @param shortName - The string to validate.
 * @param existingShortName - If provided, allows exact match (for editing existing entities).
 * @returns A validation result with `valid: true` or `valid: false` with error messages.
 */
export function validateShortName(
  shortName: string,
  existingShortName?: string,
): ShortNameValidationResult {
  // Allow exact match of existing short name (for editing)
  if (existingShortName !== undefined && shortName === existingShortName) {
    return { valid: true };
  }

  // Check specific failure cases in order
  if (shortName.startsWith('/')) {
    return buildValidationError('Cannot start with a slash');
  }
  if (shortName.endsWith('/')) {
    return buildValidationError('Cannot end with a slash');
  }
  if (shortName.includes('//')) {
    return buildValidationError('Cannot contain two consecutive slashes');
  }
  if (shortName.startsWith('.') || shortName.includes('/.')) {
    return buildValidationError('Path segments cannot start with a dot');
  }

  // Use regex for general validation
  if (!SHORT_NAME_REGEX.test(shortName)) {
    return buildValidationError(
      'Must use only letters, numbers, dashes, underscores, dots, and forward slashes',
    );
  }

  return { valid: true };
}
