class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

module.exports.FunctionMissingError = FunctionMissingError;

/** @typedef {"question" | "course-element" | "core-element" | "restart"} CallType */

/**
 * @typedef {Object} CodeCaller
 * @property {string} uuid
 * @property {() => Promise<void>} ensureChild
 * @property {(coursePath: string) => Promise<void>} prepareForCourse
 * @property {(type: CallType, directory: string, file: string, fcn: string, args: any[], callback: (err?: Error, result: any, output: string)) => void} call
 * @property {(type: CallType, directory: string, file: string, fcn: string, args: any[]) => Promise<{ result: any, output: string }>} callAsync
 * @property {(callback: (err?: Error, success: boolean) => void) => void} restart
 * @property {() => Promise<boolean>} restartAsync
 * @property {() => void} done
 */
