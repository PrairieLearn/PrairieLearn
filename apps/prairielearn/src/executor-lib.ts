import {
  type CodeCallerError,
  type CodeCallerNative,
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

export interface ExecutorResults {
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
export async function handleInput(
  line: string,
  codeCaller: CodeCallerNative,
): Promise<ExecutorResults> {
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
