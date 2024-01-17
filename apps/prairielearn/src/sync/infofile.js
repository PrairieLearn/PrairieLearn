// @ts-check
/**
 * Represents the result of attempting to load and validate an info file. May
 * contain any combination of errors, warnings, data, and a UUID.
 * @template T
 * @typedef {object} InfoFile
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {string} [uuid]
 * @property {T} [data]
 */

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
export function hasUuid(infoFile) {
  return !!infoFile.uuid;
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
export function hasErrors(infoFile) {
  return infoFile.errors.length > 0;
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
export function hasWarnings(infoFile) {
  return infoFile.warnings.length > 0;
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @returns {boolean}
 */
export function hasErrorsOrWarnings(infoFile) {
  return hasErrors(infoFile) || hasWarnings(infoFile);
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 */
export function stringifyErrors(infoFile) {
  return infoFile.errors.join('\n');
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 */
export function stringifyWarnings(infoFile) {
  return infoFile.warnings.join('\n');
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string} error
 */
export function addError(infoFile, error) {
  infoFile.errors.push(error);
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string[]} errors
 */
export function addErrors(infoFile, errors) {
  infoFile.errors = infoFile.errors.concat(errors);
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string} warning
 */
export function addWarning(infoFile, warning) {
  infoFile.warnings.push(warning);
}

/**
 * @template T
 * @param {InfoFile<T>} infoFile
 * @param {string[]} warnings
 */
export function addWarnings(infoFile, warnings) {
  infoFile.warnings = infoFile.warnings.concat(warnings);
}

/**
 * @template T
 * @param {Partial<Pick<InfoFile<T>, 'uuid' | 'data'>>} infoFile
 * @returns {InfoFile<T>}
 */
export function makeInfoFile(infoFile = {}) {
  return { ...infoFile, errors: [], warnings: [] };
}

/**
 * @template T
 * @param {string} error
 * @returns {InfoFile<T>}
 */
export function makeError(error) {
  return { errors: [error], warnings: [] };
}

/**
 * @template T
 * @param {string} warning
 * @returns {InfoFile<T>}
 */
export function makeWarning(warning) {
  return { warnings: [warning], errors: [] };
}
