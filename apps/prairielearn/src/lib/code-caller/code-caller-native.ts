import { type ChildProcess } from 'child_process';
import * as child_process from 'node:child_process';
import { type SpawnOptions } from 'node:child_process';
import * as path from 'node:path';
import { type Readable, type Writable } from 'stream';

import debugfn from 'debug';
import fs from 'fs-extra';

import { run } from '@prairielearn/run';
import { withResolvers } from '@prairielearn/utils';

import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from '../paths.js';
import { assertNever } from '../types.js';

import {
  type CallType,
  type CodeCaller,
  type CodeCallerResult,
  FunctionMissingError,
  type PrepareForCourseOptions,
} from './code-caller-shared.js';

interface CodeCallerNativeChildProcess extends ChildProcess {
  stdio: [Writable, Readable, Readable, Readable, Readable];
}

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED = Symbol('EXITED');
const RESTARTING = Symbol('RESTARTING');

type CodeCallerState =
  | typeof CREATED
  | typeof WAITING
  | typeof IN_CALL
  | typeof EXITING
  | typeof EXITED
  | typeof RESTARTING;

const debug = debugfn('prairielearn:code-caller-native');

interface CodeCallerNativeOptions {
  dropPrivileges: boolean;
  questionTimeoutMilliseconds: number;
  pingTimeoutMilliseconds: number;
  pythonVenvSearchPaths: string[];
  errorLogger: (msg: string, data?: any) => void;
}

interface CodeCallerNativeOptionsInternal extends Required<CodeCallerNativeOptions> {
  pythonExecutable: string;
}

export interface ErrorData {
  state: CodeCallerState;
  childIsNull: boolean;
  callbackIsNull: boolean;
  timeoutIDIsNull: boolean;
  outputStdout: string;
  outputStderr: string;
  outputBoth: string;
  outputData: string;
  stack: string;
  lastCallData: any;
}

export type CodeCallerError = Error & { data?: ErrorData };

/*
Internal state machine
======================

The list of internal states and the possible transitions are:

CREATED: Child process is not yet started.
  -> WAITING, EXITED

WAITING: Child process is running but no call is active, everything is healthy.
  -> IN_CALL, RESTARTING, EXITING, EXITED

IN_CALL: A call is currently running.
  -> WAITING, EXITING, EXITED

RESTARTING: The worker is restarting; waiting for confirmation of successful restart.
  -> WAITING, EXITING

EXITING: The child process is being terminated.
  -> EXITED

EXITED: The child process has exited.
  -> none
*/

export class CodeCallerNative implements CodeCaller {
  state: CodeCallerState;
  uuid: string;
  child: CodeCallerNativeChildProcess | null;
  callback: ((err: CodeCallerError | null, data?: any, output?: string) => void) | null;
  timeoutID: NodeJS.Timeout | null;
  options: CodeCallerNativeOptionsInternal;
  outputStdout: string[];
  outputStderr: string[];
  outputBoth: string[];
  outputData: string[];
  outputRestart: string;
  lastCallData: any;
  coursePath: string | null;
  forbiddenModules: string[];

  /**
   * Creating a new {@link CodeCallerNative} instance requires some async work,
   * so we use this static method to create a new instance since a constructor
   * cannot be async.
   */
  static async create(options: CodeCallerNativeOptions): Promise<CodeCallerNative> {
    const pythonExecutable = await run(async () => {
      for (const p of options.pythonVenvSearchPaths) {
        const venvPython = path.resolve(REPOSITORY_ROOT_PATH, path.join(p, 'bin', 'python3.10'));
        if (await fs.pathExists(venvPython)) return venvPython;
      }

      // Assume we're using the system Python.
      return 'python3.10';
    });

    const codeCaller = new CodeCallerNative({
      pythonExecutable,
      ...options,
    });
    await codeCaller.ensureChild();
    return codeCaller;
  }

  /**
   * Creates a new {@link CodeCallerNative} with the specified options.
   */
  private constructor(options: CodeCallerNativeOptionsInternal) {
    this.state = CREATED;
    this.uuid = crypto.randomUUID();

    this.debug('enter constructor()');

    this.child = null;
    this.callback = null;
    this.timeoutID = null;

    this.options = options;

    // Accumulators for output from the child process.
    this.outputStdout = [];
    this.outputStderr = [];
    this.outputBoth = [];
    this.outputData = [];
    this.outputRestart = '';

    // for error logging
    this.lastCallData = null;

    this.coursePath = null;
    this.forbiddenModules = [];

    this._checkState();

    this.debug('exit constructor()');
  }

  getCoursePath() {
    return this.coursePath;
  }

  /**
   * Wrapper around `debug` that automatically includes UUID and the caller state.
   */
  debug(message: string) {
    const paddedState = this.state.toString().padEnd(18);
    debug(`[${this.uuid} ${paddedState}] ${message}`);
  }

  async prepareForCourse({ coursePath, forbiddenModules }: PrepareForCourseOptions) {
    this.debug('enter prepareForCourse()');
    this.coursePath = coursePath;
    this.forbiddenModules = forbiddenModules;
    this.debug('exit prepareForCourse()');
  }

  /**
   * Calls the function in the specified Python file.
   */
  async call(
    type: CallType,
    directory: string | null,
    file: string | null,
    fcn: string | null,
    args: any[],
  ): Promise<CodeCallerResult> {
    this.debug('enter call()');

    // Reset this so that we don't include old data if the checks below fail.
    this.lastCallData = null;

    if (!this._checkState([WAITING])) {
      throw new Error(`Invalid CodeCallerNative state: ${String(this.state)}`);
    }

    let cwd: string | undefined;
    const paths = [path.join(APP_ROOT_PATH, 'python')];
    switch (type) {
      case 'question':
        if (!directory) throw new Error('Missing directory');
        if (!this.coursePath) throw new Error('Missing course path');
        cwd = path.join(this.coursePath, 'questions', directory);
        paths.push(path.join(this.coursePath, 'serverFilesCourse'));
        break;
      case 'v2-question':
        // v2 questions always use the root of the PrairieLearn repository as their
        // working directory.
        cwd = REPOSITORY_ROOT_PATH;
        break;
      case 'course-element':
        if (!directory) throw new Error('Missing directory');
        if (!this.coursePath) throw new Error('Missing course path');
        cwd = path.join(this.coursePath, 'elements', directory);
        paths.push(path.join(this.coursePath, 'serverFilesCourse'));
        break;
      case 'core-element':
        if (!directory) throw new Error('Missing directory');
        cwd = path.join(APP_ROOT_PATH, 'elements', directory);
        break;
      case 'restart':
      case 'ping':
        // Doesn't need a working directory
        break;
      default:
        assertNever(type);
    }

    const callData = { file, fcn, args, cwd, paths, forbidden_modules: this.forbiddenModules };
    const callDataString = JSON.stringify(callData);

    const promise = withResolvers<CodeCallerResult>();
    this.callback = (err, data, output) => {
      if (err) {
        promise.reject(err);
      } else {
        promise.resolve({ result: data, output: output ?? '' });
      }
    };

    const timeout =
      type === 'ping'
        ? this.options.pingTimeoutMilliseconds
        : this.options.questionTimeoutMilliseconds;
    this.timeoutID = setTimeout(this._timeout.bind(this), timeout);

    // Reset output accumulators.
    this.outputStdout = [];
    this.outputStderr = [];
    this.outputBoth = [];
    this.outputData = [];
    this.outputRestart = '';

    this.lastCallData = callData;

    this.child?.stdin?.write(callDataString);
    this.child?.stdin?.write('\n');

    this.state = IN_CALL;
    this._checkState();
    this.debug('exit call()');

    return promise.promise;
  }

  /**
   * Instructs the caller to restart, which means exiting the forked process
   * and forking a new one from the zygote.
   */
  async restart(): Promise<boolean> {
    debug(`enter restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    this._checkState([CREATED, WAITING, EXITING, EXITED]);

    if (this.state === CREATED) {
      // no need to restart if we don't have a worker
      this.debug('exit restart()');
      return true;
    } else if (this.state === WAITING) {
      const { result } = await this.call('restart', null, null, 'restart', []);
      this.coursePath = null;
      this.forbiddenModules = [];
      if (result !== 'success') throw new Error(`Error while restarting: ${result}`);
      this.debug('exit restart()');
      this.state = RESTARTING;
      return new Promise((resolve, reject) => {
        this.callback = (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        };
        this.timeoutID = setTimeout(this._restartTimeout.bind(this), 1000);

        // Before reporting the restart as successful, we need to wait
        // for a confirmation message to ensure that control has actually
        // been returned to the Zygote. There's a potential race condition
        // where we receive this confirmation before we actually enter the
        // official RESTARTING stage. To account for this, we check if
        // there was a correct restart confirmation delivered at this point.
        // If there was, we can immediately report the restart as successful.
        // Otherwise, we defer control to either the output handler or the
        // timeout; eventually, one of them will complete and allow us to exit
        // the restarting stage.
        if (this._restartWasSuccessful()) {
          this._restartIsFinished();
        }
      });
    } else if (this.state === EXITING || this.state === EXITED) {
      this.debug('exit restart()');
      return false;
    } else {
      this.debug('exit restart()');
      throw new Error(`Invalid CodeCallerNative state: ${String(this.state)}`);
    }
  }

  done() {
    this.debug('enter done()');
    this._checkState([CREATED, WAITING, EXITING, EXITED]);

    if (this.state === CREATED) {
      this.state = EXITED;
    } else if (this.state === WAITING) {
      this.child?.kill();
      this.state = EXITING;
    }
    this._checkState();
    this.debug('exit done()');
  }

  private async ensureChild() {
    this.debug('enter ensureChild()');
    this._checkState();

    if (this.state === CREATED) {
      this._startChild();
      await this.call('ping', null, null, 'ping', []);
    }

    this._checkState();
    this.debug('exit ensureChild()');
  }

  _startChild() {
    this.debug('enter _startChild()');
    this._checkState([CREATED]);

    const cmd = this.options.pythonExecutable;
    const pythonZygote = path.join(APP_ROOT_PATH, 'python', 'zygote.py');
    const args = ['-B', pythonZygote];
    const env = structuredClone(process.env);
    // PYTHONIOENCODING might not be needed once we switch to Python 3.7
    // https://www.python.org/dev/peps/pep-0538/
    // https://www.python.org/dev/peps/pep-0540/
    env.PYTHONIOENCODING = 'utf-8';
    if (this.options.dropPrivileges) {
      // This instructs the Python process to switch to a deprivileged user before
      // executing any user code.
      env.DROP_PRIVILEGES = '1';
    }

    const options: SpawnOptions = {
      cwd: import.meta.dirname,
      // stdin, stdout, stderr, data, and restart confirmations
      stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      env,
    };
    const child = child_process.spawn(cmd, args, options) as CodeCallerNativeChildProcess;
    this.debug(`started child pid ${child.pid}`);

    child.stdio[1].setEncoding('utf8');
    child.stdio[2].setEncoding('utf8');
    child.stdio[3].setEncoding('utf8');
    child.stdio[4].setEncoding('utf8');

    child.stdio[1].on('data', this._handleStdoutData.bind(this));
    child.stdio[2].on('data', this._handleStderrData.bind(this));
    child.stdio[3].on('data', this._handleStdio3Data.bind(this));
    child.stdio[4].on('data', this._handleStdio4Data.bind(this));

    child.on('exit', this._handleChildExit.bind(this));
    child.on('error', this._handleChildError.bind(this));

    this.child = child;
    this.state = WAITING;
    this._checkState();
    this.debug('exit _startChild()');
  }

  _handleStdoutData(data: string) {
    this.debug('enter _handleStdoutData()');
    this._checkState([IN_CALL, EXITING]);
    if (this.state === IN_CALL) {
      this.outputStdout.push(data);
      this.outputBoth.push(data);
    } else {
      this._logError(`Unexpected STDOUT data: ${data}`);
    }
    this.debug('exit _handleStdoutData()');
  }

  _handleStderrData(data: string) {
    this.debug('enter _handleStderrData()');
    this.debug(`_handleStderrData(), data: ${data}`);
    this._checkState([IN_CALL, EXITING, WAITING]);
    if (this.state === IN_CALL) {
      this.outputStderr.push(data);
      this.outputBoth.push(data);
    } else {
      this._logError(`Unexpected STDERR data: ${data}`);
    }
    this.debug('exit _handleStderrData()');
  }

  _handleStdio3Data(data: string) {
    this.debug('enter _handleStdio3Data()');
    this._checkState([IN_CALL, EXITING]);
    if (this.state === IN_CALL) {
      this.outputData.push(data);
      // If `data` contains a newline, then `outputData` must contain a newline as well.
      // We avoid looking in `outputData` because it's a potentially very large string.
      if (data.includes('\n')) {
        this._callIsFinished();
      }
    }
    this.debug('exit _handleStdio3Data()');
  }

  _handleStdio4Data(data: string) {
    this.debug('enter _handleStdio4Data()');
    // Unlike in other calls, we'll allow data in any state since this data
    // will come in outside the normal "call" flow and isn't guaranteed to
    // be received in the RESTARTING state.
    this.outputRestart += data;

    // If this data is received while not in the RESTARTING state, it will
    // be handled by the restart() function itself.
    if (this.state === RESTARTING && this._restartWasSuccessful()) {
      this._restartIsFinished();
    }
    this.debug('exit _handleStdio4Data()');
  }

  _handleChildExit(code: number, signal: number) {
    this.debug('enter _handleChildExit()');
    this._checkState([WAITING, IN_CALL, EXITING]);

    // Eagerly destroy all streams. While this typically happens automatically,
    // we've observed situations where the streams are sometimes not closed,
    // which can leak memory and keep the process alive longer than expected.
    for (const stream of this.child?.stdio ?? []) {
      stream.destroy();
    }

    if (this.state === WAITING) {
      this._logError(
        'CodeCallerNative child process exited while in state = WAITING, code = ' +
          String(code) +
          ', signal = ' +
          String(signal),
      );
      this.child = null;
      this.state = EXITED;
    } else if (this.state === IN_CALL) {
      this._clearTimeout();
      this.child = null;
      this.state = EXITED;
      this._callCallback(
        new Error(
          'CodeCallerNative child process exited unexpectedly, code = ' +
            String(code) +
            ', signal = ' +
            String(signal),
        ),
      );
    } else if (this.state === EXITING) {
      // no error, this is the good case
      this.child = null;
      this.state = EXITED;
    }
    this.debug('exit _handleChildExit()');
  }

  _handleChildError(error: Error) {
    this.debug('enter _handleChildError()');
    this._checkState([WAITING, IN_CALL, EXITING]);
    if (this.state === WAITING) {
      this._logError(
        'CodeCallerNative child process raised error while in state = WAITING, message = ' +
          String(error),
      );
      this.state = EXITING;
      this.child?.kill('SIGTERM');
    } else if (this.state === IN_CALL) {
      this._logError(
        'CodeCallerNative child process raised error while in state = IN_CALL, message = ' +
          String(error),
      );
      this._clearTimeout();
      this.state = EXITING;
      this.child?.kill('SIGTERM');
      const err = new Error('CodeCallerNative child process error: ' + String(error));
      this._callCallback(err);
    } else if (this.state === EXITING) {
      this._logError(
        'CodeCallerNative child process raised error while in state = EXITING, message = ' +
          String(error),
      );
    }
    this._checkState();
    this.debug('exit _handleChildError()');
  }

  _timeout() {
    this.debug('enter _timeout()');
    this._checkState([IN_CALL]);
    this.timeoutID = null;
    const err = new Error('timeout exceeded, killing CodeCallerNative child');
    this.child?.kill('SIGTERM');
    this.state = EXITING;
    this._callCallback(err);
    this.debug('exit _timeout()');
  }

  _clearTimeout() {
    this.debug('enter _clearTimeout()');
    clearTimeout(this.timeoutID ?? undefined);
    this.timeoutID = null;
    this.debug('exit _clearTimeout()');
  }

  _restartTimeout() {
    this.debug('enter _restartTimeout()');
    this._checkState([RESTARTING]);
    this.timeoutID = null;
    const err = new Error('restart timeout exceeded, killing CodeCallerNative child');
    this.child?.kill('SIGTERM');
    this.state = EXITING;
    this._callCallback(err);
    this.debug('exit _restartTimeout()');
  }

  _clearRestartTimeout() {
    this.debug('enter _clearRestartTimeout()');
    clearTimeout(this.timeoutID ?? undefined);
    this.timeoutID = null;
    this.debug('exit _clearRestartTimeout()');
  }

  _callCallback(err: CodeCallerError | null, data?: any, output?: string) {
    this.debug('enter _callCallback()');
    if (err) err.data = this._errorData();
    const c = this.callback;
    this.callback = null;
    c?.(err, data, output);
    this.debug('exit _callCallback()');
  }

  _callIsFinished() {
    this.debug('enter _callIsFinished()');
    if (!this._checkState([IN_CALL])) return;
    this._clearTimeout();
    let data: {
      val: any;
      present: boolean;
    } | null = null;
    let err: Error | null = null;
    try {
      data = JSON.parse(this.outputData.join(''));
    } catch (e: unknown) {
      err = new Error('Error decoding CodeCallerNative JSON: ' + (e instanceof Error ? e.message : String(e)));
    }
    if (err) {
      this.state = EXITING;
      this.child?.kill('SIGTERM');
      this._callCallback(err);
    } else {
      this.state = WAITING;
      if (data?.present) {
        this._callCallback(null, data.val, this.outputBoth.join(''));
      } else {
        this._callCallback(new FunctionMissingError('Function not found in module'));
      }
    }

    // This is potentially quite a large object. Drop our reference to it to
    // allow this memory to be quickly garbage collected.
    this.lastCallData = null;

    this.debug('exit _callIsFinished()');
  }

  /**
   * Returns true if a restart was successfully confirmed. A return value of
   * false doesn't necessarily mean that the restart has failed; we just may
   * not yet have enough information to determine if it was successful. We
   * always let the restart timeout handle the unsuccessful case to simplify
   * code.
   */
  _restartWasSuccessful() {
    if (!this.outputRestart.includes('\n')) {
      // We haven't yet gotten enough output to know if the restart
      // was successful.
      return false;
    }
    try {
      const data = JSON.parse(this.outputRestart);
      return data.exited === true;
    } catch {
      return false;
    }
  }

  _restartIsFinished() {
    this.debug('enter _restartIsFinished()');
    if (!this._checkState([RESTARTING])) return;
    this._clearRestartTimeout();
    this.state = WAITING;
    const c = this.callback;
    this.callback = null;
    // This function is guaranteed to only be called if there was a successful
    // restart, so we don't have to do any checking here.
    c?.(null, true);
    this.debug('exit _restartIsFinished()');
  }

  _errorData(): ErrorData {
    const errForStack = new Error();
    return {
      state: this.state,
      childIsNull: this.child == null,
      callbackIsNull: this.callback == null,
      timeoutIDIsNull: this.timeoutID == null,
      outputStdout: this.outputStdout.join(''),
      outputStderr: this.outputStderr.join(''),
      outputBoth: this.outputBoth.join(''),
      outputData: this.outputData.join(''),
      stack: errForStack.stack ?? '',
      lastCallData: this.lastCallData,
    };
  }

  _logError(msg: string) {
    this.debug('enter _logError()');
    const errData = this._errorData();
    this.options.errorLogger(msg, errData);
    this.debug('exit _logError()');
    return false;
  }

  _checkState(allowedStates?: CodeCallerState[]) {
    if (allowedStates && !allowedStates.includes(this.state)) {
      const allowedStatesList = '[' + allowedStates.map(String).join(',') + ']';
      return this._logError(
        'Expected CodeCallerNative states ' +
          allowedStatesList +
          ' but actually have state ' +
          String(this.state),
      );
    }

    if (![CREATED, WAITING, IN_CALL, RESTARTING, EXITING, EXITED].includes(this.state)) {
      return this._logError('Invalid CodeCallerNative state: ' + String(this.state));
    }

    const childNull = [CREATED, EXITED].includes(this.state);
    const callbackNull = ![IN_CALL, RESTARTING].includes(this.state);
    const timeoutIDNull = ![IN_CALL, RESTARTING].includes(this.state);

    if (childNull && this.child != null) {
      return this._logError(
        'CodeCallerNative state "' + String(this.state) + '": child should be null',
      );
    }
    if (!childNull && this.child == null) {
      return this._logError(
        'CodeCallerNative state "' + String(this.state) + '": child should not be null',
      );
    }

    if (callbackNull && this.callback != null) {
      return this._logError(
        'CodeCallerNative state "' + String(this.state) + '": callback should be null',
      );
    }
    if (!callbackNull && this.callback == null) {
      return this._logError(
        'CodeCallerNative state "' + String(this.state) + '": callback should not be null',
      );
    }

    if (timeoutIDNull && this.timeoutID != null) {
      return this._logError(
        'CodeCallerNative state "' + String(this.state) + '": timeoutID should be null',
      );
    }
    if (!timeoutIDNull && this.timeoutID == null) {
      return this._logError(
        'CodeCallerNative state "' + String(this.state) + '": timeoutID should not be null',
      );
    }

    return true;
  }
}
