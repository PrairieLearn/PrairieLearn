class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

module.exports.FunctionMissingError = FunctionMissingError;

/** @typedef {"question" | "course-element" | "core-element" | "restart"} CallType */

/**
 * @typedef {Object} CallOptions
 * @property {number} timeout - timeout in milliseconds
 */

/**
 * @typedef {Object} CodeCaller
 * @property {string} uuid
 * @property {() => Promise<void>} ensureChild
 * @property {(coursePath: string) => Promise<void>} prepareForCourse
 * @property {(type: CallType, directory: string, file: string, fcn: string, args: any[], options?: CallOptions) => Promise<{ result: any, output: string }>} call
 * @property {(options?: CallOptions) => Promise<boolean>} restart
 * @property {() => void} done
 */
