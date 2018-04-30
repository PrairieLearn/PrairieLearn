/**
* Borrowed from https://github.com/apocas/dockerode/blob/master/lib/util.js
*
* Parse the given repo tag name (as a string) and break it out into repo/tag pair.
* // if given the input http://localhost:8080/woot:latest
* {
*   repository: 'http://localhost:8080/woot',
*   tag: 'latest'
* }
* @param {String} input Input e.g: 'repo/foo', 'ubuntu', 'ubuntu:latest'
* @return {Object} input parsed into the repo and tag.
*/
module.exports.parseRepositoryTag = function(input) {
    var separatorPos;
    var digestPos = input.indexOf('@');
    var colonPos = input.lastIndexOf(':');
    // @ symbol is more important
    if (digestPos >= 0) {
        separatorPos = digestPos;
    } else if (colonPos >= 0) {
        separatorPos = colonPos;
    } else {
        // no colon nor @
        return {
            repository: input
        };
    }

    // last colon is either the tag (or part of a port designation)
    var tag = input.slice(separatorPos + 1);

    // if it contains a / its not a tag and is part of the url
    if (tag.indexOf('/') === -1) {
        return {
            repository: input.slice(0, separatorPos),
            tag: tag
        };
    }

    return {
        repository: input
    };
};

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
