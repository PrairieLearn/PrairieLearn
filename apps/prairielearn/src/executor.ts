#!/usr/bin/env node

import { createInterface } from 'node:readline';

import {
  type CodeCallerError,
  CodeCallerNative,
  type ErrorData,
} from './lib/code-caller/code-caller-native.js';
import { type CallType } from './lib/code-caller/code-caller-shared.js';
import { FunctionMissingError } from './lib/code-caller/index.js';

interface ExecutorRequest {
  type: CallType;
  directory: string;
  file: string;
  fcn: string;
  args: any[];
  forbidden_modules: string[];
}

interface ExecutorResults {
  error?: string;
  errorData?: ErrorData;
  data?: any;
  output?: string;
  functionMissing?: boolean;
  needsFullRestart: boolean;
}

/**
 * Receives a single line of input and executes the instructions contained in
 * it in the provided code caller.
 *
 * The Promise returned from this function should never reject - errors will
 * be indicated by the `error` property on the result.
 */
async function handleInput(line: string, codeCaller: CodeCallerNative): Promise<ExecutorResults> {
  let request: ExecutorRequest;
  try {
    request = JSON.parse(line);
  } catch (err: any) {
    // We shouldn't ever get malformed JSON from the caller - but if we do,
    // handle it gracefully.
    return {
      error: err.message,
      needsFullRestart: false,
    };
  }

  if (request.fcn === 'restart') {
    let restartErr: Error | undefined;
    let success: boolean | undefined;

    try {
      success = await codeCaller.restart();
    } catch (err: any) {
      restartErr = err;
    }

    return {
      data: 'success',
      needsFullRestart: !!restartErr || !success,
    };
  }

  // Course will always be at `/course` in the Docker executor
  try {
    await codeCaller.prepareForCourse({
      coursePath: '/course',
      forbiddenModules: request.forbidden_modules,
    });
  } catch {
    // We should never actually hit this case - but if we do, handle it so
    // that all our bases are covered.
    return { needsFullRestart: true };
  }

  let result: any, output: string | undefined, callErr: Error | CodeCallerError | undefined;
  try {
    ({ result, output } = await codeCaller.call(
      request.type,
      request.directory,
      request.file,
      request.fcn,
      request.args,
    ));
  } catch (err: any) {
    callErr = err;
  }

  const functionMissing = callErr instanceof FunctionMissingError;
  return {
    // `FunctionMissingError` shouldn't be propagated as an actual error
    // we'll report it via `functionMissing`
    error: callErr && !functionMissing ? callErr.message : undefined,
    errorData: callErr && !functionMissing ? (callErr as CodeCallerError).data : undefined,
    data: result,
    output,
    functionMissing,
    needsFullRestart: false,
  };
}

let questionTimeoutMilliseconds = Number.parseInt(process.env.QUESTION_TIMEOUT_MILLISECONDS ?? '');
if (Number.isNaN(questionTimeoutMilliseconds)) {
  questionTimeoutMilliseconds = 10000;
}

let pingTimeoutMilliseconds = Number.parseInt(process.env.PING_TIMEOUT_MILLISECONDS ?? '');
if (Number.isNaN(pingTimeoutMilliseconds)) {
  pingTimeoutMilliseconds = 60_000;
}

async function prepareCodeCaller() {
  return await CodeCallerNative.create({
    dropPrivileges: true,
    questionTimeoutMilliseconds,
    pingTimeoutMilliseconds,
    errorLogger: console.error,
    // Currently, we'll always use the system Python.
    // TODO: Point this to a venv that will be installed in the Docker image.
    pythonVenvSearchPaths: [],
  });
}

process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));

(async () => {
  let codeCaller = await prepareCodeCaller();

  // Our overall loop looks like this: read a line of input from stdin, spin
  // off a python worker to handle it, and write the results back to stdout.
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Once the readline interface closes, we can't get any more input; die
  // immediately to allow our container to be removed.
  rl.on('close', () => process.exit(0));

  for await (const line of rl) {
    const results = await handleInput(line, codeCaller);
    const { needsFullRestart, ...rest } = results;
    process.stdout.write(JSON.stringify(rest) + '\n');
    if (needsFullRestart) {
      codeCaller.done();
      codeCaller = await prepareCodeCaller();
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
