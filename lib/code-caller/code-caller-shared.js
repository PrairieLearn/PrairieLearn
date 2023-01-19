class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

module.exports.FunctionMissingError = FunctionMissingError;

/** @typedef {"question" | "v2-question" | "course-element" | "core-element" | "ping" | "restart"} CallType */

/**
 * @typedef {Object} CodeCaller
 * @property {string} uuid
 * @property {() => Promise<void>} ensureChild
 * @property {(coursePath: string) => Promise<void>} prepareForCourse
 * @property {(type: CallType, directory: string, file: string, fcn: string, args: any[]) => Promise<{ result: any, output: string }>} call
 * @property {() => Promise<boolean>} restart
 * @property {() => void} done
 */
