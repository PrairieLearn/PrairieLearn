// @ts-check
const http = require('http');
const readline = require('readline');
const { FunctionMissingError } = require('./lib/code-caller');
const { CodeCallerNative } = require('./lib/code-caller/code-caller-native');

/**
 * @typedef {Object} Request
 * @property {import('./lib/code-caller/code-caller-native').CallType} type
 * @property {string} directory
 * @property {string} file
 * @property {string} fcn
 * @property {any[]} args
 */

/**
 * @typedef {Object} Results
 * @property {string} [error]
 * @property {import('./lib/code-caller/code-caller-native').ErrorData} [errorData]
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
 * @param {CodeCallerNative} codeCaller
 * @returns {Promise<Results>}
 */
async function handleInput(line, codeCaller) {
  /** @type {Request} */
  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    // We shouldn't ever get malformed JSON from the caller - but if we do,
    // handle it gracefully.
    return {
      error: err.message,
      needsFullRestart: false,
    };
  }

  if (request.fcn === 'restart') {
    let restartErr;
    let success;

    try {
      success = await codeCaller.restart();
    } catch (err) {
      restartErr = err;
    }

    return {
      data: 'success',
      needsFullRestart: !!restartErr || !success,
    };
  }

  // Course will always be at `/course` in the Docker executor
  try {
    await codeCaller.prepareForCourse('/course');
  } catch (err) {
    // We should never actually hit this case - but if we do, handle it so
    // that all our bases are covered.
    return { needsFullRestart: true };
  }

  let result, output, callErr;
  try {
    ({ result, output } = await codeCaller.call(
      request.type,
      request.directory,
      request.file,
      request.fcn,
      request.args
    ));
  } catch (err) {
    callErr = err;
  }

  const functionMissing = callErr instanceof FunctionMissingError;
  return {
    // `FunctionMissingError` shouldn't be propagated as an actual error
    // we'll report it via `functionMissing`
    error: callErr && !functionMissing ? callErr.message : undefined,
    errorData: callErr && !functionMissing ? callErr.data : undefined,
    data: result,
    output,
    functionMissing,
    needsFullRestart: false,
  };
}

(async () => {
  // Set up a simple HTTP server to handle health checks. We'll consider the
  // executor to be healthy once we've successfully done a restart of the child
  // process.
  let isHealthy = false;
  const server = http.createServer((req, res) => {
    res.writeHead(isHealthy ? 200 : 500);
    res.end();
  });
  server.listen(3000);

  // Our overall loop looks like this: read a line of input from stdin, spin
  // off a python worker to handle it, and write the results back to stdout.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let questionTimeoutMilliseconds = Number.parseInt(process.env.QUESTION_TIMEOUT_MILLISECONDS);
  if (Number.isNaN(questionTimeoutMilliseconds)) {
    questionTimeoutMilliseconds = 10000;
  }

  let codeCaller = new CodeCallerNative({
    dropPrivileges: true,
    questionTimeoutMilliseconds,
    errorLogger: console.error,
  });
  await codeCaller.ensureChild();

  // Once we have a child process, try to restart and give it two minutes to
  // complete. If it does not, we'll kill this executor and allow another one
  // to replace it.
  await codeCaller.restart({ timeout: 1000 * 60 * 2 });

  // If we got here, we're healthy! Update this flag so the health check can
  // report ourselves as healthy.
  isHealthy = true;

  // Safety check: if we receive more input while handling another request,
  // discard it.
  let processingRequest = false;
  rl.on('line', (line) => {
    if (processingRequest) {
      // Someone else messed up - fail fast.
      process.exit(1);
    }

    processingRequest = true;
    handleInput(line, codeCaller)
      .then(async (results) => {
        const { needsFullRestart, ...rest } = results;
        if (needsFullRestart) {
          codeCaller.done();
          codeCaller = new CodeCallerNative({
            dropPrivileges: true,
            questionTimeoutMilliseconds,
            errorLogger: console.error,
          });
          await codeCaller.ensureChild();
        }
        console.log(JSON.stringify(rest));
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        processingRequest = false;
      });
  });

  rl.on('close', () => {
    // We can't get any more input; die immediately to allow our container
    // to be removed.
    process.exit(0);
  });
})();
