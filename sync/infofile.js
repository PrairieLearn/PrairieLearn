// @ts-check
/**
 * Represents the result of attempting to load and validate an info file. May
 * contain any combination of errors, warnings, data, and a UUID.
 * @template T
 * @typedef {object} InfoFile
 * @property {string[]} [errors]
 * @property {string[]} [warnings]
 * @property {string} [uuid]
 * @property {T} [data]
 */

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
module.exports.hasUuid = function (infoFile) {
  return !!infoFile.uuid;
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
module.exports.hasErrors = function (infoFile) {
  return !!(infoFile.errors && infoFile.errors.length > 0);
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
module.exports.hasWarnings = function (infoFile) {
  return !!(infoFile.warnings && infoFile.warnings.length > 0);
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
module.exports.hasErrorsOrWarnings = function (infoFile) {
  return module.exports.hasErrors(infoFile) || module.exports.hasWarnings(infoFile);
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 */
module.exports.stringifyErrors = function (infoFile) {
  if (!this.hasErrors(infoFile)) return '';
  return infoFile.errors.join('\n');
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 */
module.exports.stringifyWarnings = function (infoFile) {
  if (!this.hasWarnings(infoFile)) return '';
  return infoFile.warnings.join('\n');
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string} error
 */
module.exports.addError = function (infoFile, error) {
  if (!this.hasErrors(infoFile)) {
    infoFile.errors = [];
  }
  infoFile.errors.push(error);
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string[]} errors
 */
module.exports.addErrors = function (infoFile, errors) {
  if (!this.hasErrors(infoFile)) {
    infoFile.errors = [];
  }
  infoFile.errors = infoFile.errors.concat(errors);
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string} warning
 */
module.exports.addWarning = function (infoFile, warning) {
  if (!this.hasWarnings(infoFile)) {
    infoFile.warnings = [];
  }
  infoFile.warnings.push(warning);
};

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string[]} warnings
 */
module.exports.addWarnings = function (infoFile, warnings) {
  if (!this.hasWarnings(infoFile)) {
    infoFile.warnings = [];
  }
  infoFile.warnings = infoFile.warnings.concat(warnings);
};

/**
 * @template T
 * @param {string} error
 * @returns {InfoFile<T>}
 */
module.exports.makeError = function (error) {
  return { errors: [error] };
};

/**
 * @template T
 * @param {string} warning
 * @returns {InfoFile<T>}
 */
module.exports.makeWarning = function (warning) {
  return { warnings: [warning] };
};
