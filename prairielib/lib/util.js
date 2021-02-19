/**
 * Recursively traverse an object and replace null bytes (\u0000) with the
 * literal string "\u0000". This produces a new object and does not modify the
 * provided object.
 * @param  {Object} obj The object to be sanitized.
 * @return {Object}     The sanitized object.
 */
module.exports.sanitizeObject = function sanitizeObject(value) {
    if (Array.isArray(value)) {
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
