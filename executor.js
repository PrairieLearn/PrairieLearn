// @ts-check
const readline = require('readline');
const { PythonCaller } = require('./lib/code-caller-python');
const { FunctionMissingError } = require('./lib/code-caller-shared');

/**
 * @typedef {Object} Request
 * @property {import('./lib/code-caller-python').CallType} type
 * @property {string} directory
 * @property {string} file
 * @property {string} fcn
 * @property {any[]} args
 */

/**
 * @typedef {Object} Results
 * @property {string} [error]
 * @property {import('./lib/code-caller-python').ErrorData} [errorData]
 * @property {any} [data]
 * @property {string} [output]
 * @property {boolean} [functionMissing]
 * @property {boolean} needsFullRestart
 */

/**
 * Receives a single line of input and executes the instructions contained in
 * it in the provided code caller.
 *
 * The Promise returned from this function should never reject - errors will
 * be indicated by the `error` property on the result.
 *
 * @param {string} line
 * @param {PythonCaller} caller
 * @returns {Promise<Results>}
 */
function handleInput(line, caller) {
  return new Promise((resolve) => {
    /** @type {Request} */
    let request;
    try {
      request = JSON.parse(line);
    } catch (err) {
      // We shouldn't ever get malformed JSON from the caller - but if we do,
      // handle it gracefully.
      resolve({
        error: err.message,
        needsFullRestart: false,
      });
      return;
    }

    if (request.fcn === 'restart') {
      caller.restart((restartErr, success) => {
        resolve({
          data: 'success',
          needsFullRestart: !!restartErr || !success,
        });
      });
      return;
    }

    // Course will always be at `/course` in the Docker executor
    caller.prepareForCourse('/course', (err) => {
      if (err) {
        // We should never actually hit this case - but if we do, handle it so
        // that all our bases are covered.
        resolve({ needsFullRestart: true });
      }

      caller.call(
        request.type,
        request.directory,
        request.file,
        request.fcn,
        request.args,
        (err, data, output) => {
          const functionMissing = err instanceof FunctionMissingError;
          resolve({
            // `FunctionMissingError` shouldn't be propagated as an actual error
            // we'll report it via `functionMissing`
            // TODO: `error.data` contains valuable information - we should try
            // to shuttle it back up to the parent process so it can be displayed.
            error: err && !functionMissing ? err.message : undefined,
            errorData: err && !functionMissing ? err.data : undefined,
            data,
            output,
            functionMissing,
            needsFullRestart: false,
          });
        }
      );
    });
  });
}

// Our overall loop looks like this: read a line of input from stdin, spin
// off a python worker to handle it, and write the results back to stdout.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let questionTimeoutMilliseconds;
try {
  questionTimeoutMilliseconds = Number.parseInt(process.env.QUESTION_TIMEOUT_MILLISECONDS);
} catch (e) {
  questionTimeoutMilliseconds = 10000;
}

let pc = new PythonCaller({ dropPrivileges: true, questionTimeoutMilliseconds });
pc.ensureChild();

// Safety check: if we receive more input while handling another request,
// discard it.
let processingRequest = false;
rl.on('line', (line) => {
  if (processingRequest) {
    // Someone else messed up - fail fast.
    process.exit(1);
  }

  processingRequest = true;
  handleInput(line, pc)
    .then((results) => {
      const { needsFullRestart, ...rest } = results;
      if (needsFullRestart) {
        pc.done();
        pc = new PythonCaller();
        pc.ensureChild();
      }
      console.log(JSON.stringify(rest));
      processingRequest = false;
    })
    .catch((err) => {
      console.error(err);
      processingRequest = false;
    });
});

rl.on('close', () => {
  // We can't get any more input; die immediately to allow our container
  // to be removed.
  process.exit(0);
});
