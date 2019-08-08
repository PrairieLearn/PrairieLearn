// @ts-check
/**
 * @template T
 * @typedef {object} Either Contains either an error or data; data may include warnings.
 * @property {string[]} [errors]
 * @property {string[]} [warnings]
 * @property {T} [data]
 */

/**
 * @template T
 * @param {Either<T>} either
 * @returns {boolean}
 */
module.exports.hasErrors = function(either) {
    return !!(either.errors && either.errors.length > 0);
}

/**
 * @template T
 * @param {Either<T>} either
 * @returns {boolean}
 */
module.exports.hasWarnings = function(either) {
    return !!(either.warnings && either.warnings.length > 0);
}

/**
 * @template T
 * @param {Either<T>} either
 */
module.exports.stringifyErrors = function(either) {
    if (!this.hasErrors(either)) return '';
    return either.errors.join('\n');
}

/**
 * @template T
 * @param {Either<T>} either
 */
module.exports.stringifyWarnings = function(either) {
    if (!this.hasErrors(either)) return '';
    return either.errors.join('\n');
}

/**
 * @template T
 * @param {Either<T>} either
 * @param {string} error
 */
module.exports.addError = function(either, error) {
    if (!this.hasErrors(either)) {
        either.errors = [];
    }
    either.errors.push(error);
}

/**
 * @template T
 * @param {Either<T>} either
 * @param {string} warning
 */
module.exports.addWarning = function(either, warning) {
    if (!this.hasWarnings(either)) {
        either.warnings = [];
    }
    either.warnings.push(warning);
}

/**
 * @template T
 * @param {string} error
 * @returns {Either<T>}
 */
module.exports.makeError = function(error) {
    return { errors: [error] };
}

/**
 * @template T
 * @param {string} warning
 * @returns {Either<T>}
 */
module.exports.makeWarning = function(warning) {
    return { warnings: [warning] };
}
