/**
 * Regular expression for validating short names, including course instance short names and QIDs.
 *
 * The RegExp is compiled with the `v` flag, which matches the behavior of browsers when this is
 * used in a `pattern` attribute. This is important, because it forces/allows us to escape the
 * `-` character in character classes.
 *
 * Dots are allowed in non-leading positions of each path segment (e.g., `foo.bar` or `foo/bar.baz`
 * are valid, but `.foo` or `foo/.bar` are not).
 */
export const SHORT_NAME_REGEX =
  /^[A-Za-z0-9\-_][A-Za-z0-9\-_.]*(\/[A-Za-z0-9\-_][A-Za-z0-9\-_.]*)*$/v;

/**
 * String pattern for short names, suitable for use in HTML pattern attributes.
 * Derived from SHORT_NAME_REGEX to maintain a single source of truth.
 */
export const SHORT_NAME_PATTERN = SHORT_NAME_REGEX.source;

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
