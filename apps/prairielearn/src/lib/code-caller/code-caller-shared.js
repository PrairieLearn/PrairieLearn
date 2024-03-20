class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

module.exports.FunctionMissingError = FunctionMissingError;

/** @typedef {"question" | "v2-question" | "course-element" | "core-element" | "ping" | "restart"} CallType */

/**
 * @typedef {Object} PrepareForCourseOptions
 * @property {string} coursePath
 * @property {string[]} forbiddenModules
 */

/**
 * @typedef {Object} CodeCaller
 * @property {string} uuid
 * @property {() => Promise<void>} ensureChild
 * @property {(options: PrepareForCourseOptions) => Promise<void>} prepareForCourse
 * @property {(type: CallType, directory: string | null, file: string | null, fcn: string | null, args: any[]) => Promise<{ result: any, output: string }>} call
 * @property {() => Promise<boolean>} restart
 * @property {() => void} done
 */
