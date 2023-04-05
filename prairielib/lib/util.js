/**
 * Recursively traverse an object and replace null bytes (\u0000) with the
 * literal string "\u0000". This produces a new object and does not modify the
 * provided object.
 * @param  {Object} value The object to be sanitized.
 * @return {Object} The sanitized object.
 */
module.exports.sanitizeObject = function sanitizeObject(value) {
  if (value === null) {
    return null;
  } else if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  } else if (typeof value === 'string') {
    return value.replace('\u0000', '\\u0000');
  } else if (typeof value === 'object') {
    const sanitized = Object.entries(value).map(([key, value]) => {
      return [key, sanitizeObject(value)];
    });
    return sanitized.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  } else {
    return value;
  }
};

/**
 * Escape special characters in a RegExp string
 * Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_special_characters
 * @param {string} string A literal string to act as a match for RegExp objects
 * @return {string} A string literal ready to match
 */
module.exports.escapeRegExp = function escapeRegExp(string) {
  return string.replace(/[.*+\-?^${}()|[\]\\/]/g, '\\$&');
};

/**
 * Recursively truncates all strings in a value to a maximum length.
 *
 * @template T
 * @param {T} value
 * @param {number} maxLength
 * @returns {T}
 */
module.exports.recursivelyTruncateStrings = function recursivelyTruncateStrings(value, maxLength) {
  if (value === null) {
    return null;
  } else if (typeof value === 'string') {
    if (value.length <= maxLength) {
      return value;
    }
    return value.substring(0, maxLength) + '...[truncated]';
  } else if (Array.isArray(value)) {
    return value.map((value) => recursivelyTruncateStrings(value, maxLength));
  } else if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, value]) => {
      acc[key] = recursivelyTruncateStrings(value, maxLength);
      return acc;
    }, {});
  } else {
    return value;
  }
};
