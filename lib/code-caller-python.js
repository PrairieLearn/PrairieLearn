// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
const path = require('path');
const child_process = require('child_process');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');

const activeCallers = {};

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const RESTARTING = Symbol('RESTARTING');
const EXITING = Symbol('EXITING');
const EXITED = Symbol('EXITED');

class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

/**
 * @typedef {Object} PythonCallerOptions
 * @property {boolean} [dropPrivileges]
 * @property {number} questionTimeoutMilliseconds
 */

/** @typedef {CREATED | WAITING | IN_CALL | RESTARTING | EXITING | EXITED} CodeCallerState */

/** @typedef {"question" | "course-element" | "core-element" | "restart"} CallType */

/** @typedef {import('./code-caller-python-types').PythonCallerChildProcess} PythonCallerChildProcess */

/**
 * @typedef {Object} ErrorData
 * @property {CodeCallerState} state
 * @property {boolean} childIsNull
 * @property {boolean} callbackIsNull
 * @property {boolean} timeoutIDIsNull
 * @property {string} outputStdout
 * @property {string} outputStderr
 * @property {string} outputBoth
 * @property {string} outputData
 * @property {string} stack
 * @property {any} lastCallData
 */

/** @typedef {Error & { data?: ErrorData }} CodeCallerError */

/*
  Usage
  =====

  Create a new PythonCaller object, then do call() repeatedly and wait
  for each call to finish, then do done() to finish.


  Public Methods
  ==============

  constructor(): make a new PythonCaller object but do not do any work

  call(file, fcn, args, options, callback): run file.fcn(args)
    callback should take (err, data, output):
      err is an Error() or null
      data is the returned value from the function
      output is a string containing STDOUT and STDERR together

  restart(): restart the child process to clear out any stale state

  done(): clean up the running python process (if any)

  ensureChild(): start a child worker process if necessary


  Example
  =======

  const pc = PythonCaller()
  pc.call('myfile.py', 'add', [34, 21], {}, (err, result, consoleLog) => {
      if (err) ...;
      console.log('the sum is', result.val);
      console.log('the caller STDOUT+STDERR is', consoleLog);

      pc.call('otherfile.py', 'concat', ['abc', 'def'], {}, (err, result, consoleLog) => {
          if (err) ...;
          console.log('the concatenation is', result.valstring);
          console.log('the caller STDOUT+STDERR is', consoleLog);

          pc.done();
      });
  });


  Notes
  =====

  - PythonCaller uses a lazy-start model where the child process isn't
    started until the first call(), so it's cheap to create a
    PythonCaller object and never use it.

  - It is safe to call done() even if call() was never called.


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
class PythonCaller {
  /**
   * Creates a new PythonCaller with the specified options.
   *
   * @param {PythonCallerOptions} [options]
   */
  constructor(options = { dropPrivileges: false, questionTimeoutMilliseconds: 5000 }) {
    /** @type {CodeCallerState} */
    this.state = CREATED;
    this.uuid = uuidv4();

    this.debug('enter constructor()');

    /** @type {PythonCallerChildProcess} */
    this.child = null;
    this.callback = null;
    this.timeoutID = null;

    this.options = options;

    // variables to accumulate child output
    this.outputStdout = '';
    this.outputStderr = '';
    this.outputBoth = '';
    this.outputData = '';
    this.outputRestart = '';

    // for error logging
    this.lastCallData = null;

    this._checkState();

    this.debug('exit constructor()');
  }

  /**
   * Wrapper around `debug` that automatically includes UUID and the caller state.
   *
   * @param {string} message
   */
  debug(message) {
    const paddedState = this.state.toString().padEnd(18);
    debug(`[${this.uuid} ${paddedState}] ${message}`);
  }

  prepareForCourse(coursePath, callback) {
    this.debug('enter prepareForCourse()');
    this.coursePath = coursePath;
    this.debug('exit prepareForCourse()');
    callback(null);
  }

  /**
   * Calls the function in the specified Python file.
   *
   * @param {CallType} type
   * @param {string} directory
   * @param {string} file
   * @param {string} fcn
   * @param {any[]} args
   * @param {(err: CodeCallerError | undefined, data?: any, output?: string) => void} callback
   */
  call(type, directory, file, fcn, args, callback) {
    this.debug('enter call()');
    if (!this._checkState([CREATED, WAITING])) {
      return callback(new Error('invalid PythonCaller state'));
    }

    if (this.state === CREATED) {
      this._startChild();
    }

    let cwd;
    const paths = [path.join(__dirname, '..', 'python')];
    if (type === 'question') {
      cwd = path.join(this.coursePath, 'questions', directory);
      paths.push(path.join(this.coursePath, 'serverFilesCourse'));
    } else if (type === 'course-element') {
      cwd = path.join(this.coursePath, 'elements', directory);
      paths.push(path.join(this.coursePath, 'serverFilesCourse'));
    } else if (type === 'core-element') {
      cwd = path.join(__dirname, '..', 'elements', directory);
    } else if (type === 'restart') {
      // Doesn't need a working directory
    } else {
      callback(new Error(`Unknown function call type: ${type}`));
      return;
    }

    const callData = { file, fcn, args, cwd, paths };
    const callDataString = JSON.stringify(callData);
    this.callback = callback;

    this.timeoutID = setTimeout(this._timeout.bind(this), this.options.questionTimeoutMilliseconds);

    this.outputStdout = '';
    this.outputStderr = '';
    this.outputBoth = '';
    this.outputData = '';
    this.outputRestart = '';

    this.lastCallData = callData;

    this.child.stdin.write(callDataString);
    this.child.stdin.write('\n');

    this.state = IN_CALL;
    this._checkState();
    this.debug('exit call()');
  }

  /**
   * Instructs the caller to restart, which means exiting the forked process
   * and forking a new one from the zygote.
   *
   * @param {(err: Error | undefined, success?: boolean) => void} callback
   */
  restart(callback) {
    this.debug('enter restart()');
    this._checkState([CREATED, WAITING, EXITING, EXITED]);

    if (this.state === CREATED) {
      // no need to restart if we don't have a worker
      this.debug('exit restart()');
      callback(null, true);
    } else if (this.state === WAITING) {
      this.call('restart', null, null, 'restart', [], (err, ret_val, _consoleLog) => {
        if (ERR(err, callback)) return;
        if (ret_val !== 'success') return callback(new Error(`Error while restarting: ${ret_val}`));
        this.debug('exit restart()');

        this.state = RESTARTING;
        this.callback = callback;
        this.timeoutID = setTimeout(this._restartTimeout.bind(this), 1000);

        // Before reporting the restart as successful, we need to wait
        // for a confirmation message to ensure that control has actually
        // been returned to the Zygote. There's a potential race condition
        // where we recieve this confirmation before we actually enter the
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
      callback(null, false);
    } else {
      this.debug('exit restart()');
      callback(new Error(`invalid state ${String(this.state)}`));
    }
  }

  done() {
    this.debug('enter done()');
    this._checkState([CREATED, WAITING, EXITING, EXITED]);

    if (this.state === CREATED) {
      this.state = EXITED;
    } else if (this.state === WAITING) {
      this.child.kill();
      this.state = EXITING;
    }
    this._checkState();
    this.debug('exit done()');
  }

  async ensureChild() {
    this.debug('enter ensureChild()');
    this._checkState();

    if (this.state === CREATED) {
      this._startChild();
    }

    this._checkState();
    this.debug('exit ensureChild()');
  }

  _startChild() {
    this.debug('enter _startChild()');
    this._checkState([CREATED]);
    activeCallers[this.uuid] = this;

    const cmd = 'python3';
    const pythonZygote = path.join(__dirname, '..', 'python', 'zygote.py');
    const args = ['-B', pythonZygote];
    const env = _.clone(process.env);
    // PYTHONIOENCODING might not be needed once we switch to Python 3.7
    // https://www.python.org/dev/peps/pep-0538/
    // https://www.python.org/dev/peps/pep-0540/
    env.PYTHONIOENCODING = 'utf-8';
    if (this.options.dropPrivileges) {
      // This instructs the Python process to switch to a deprivileged user before
      // executing any user code.
      env.DROP_PRIVILEGES = 1;
    }

    /** @type {import('child_process').SpawnOptions} */
    const options = {
      cwd: __dirname,
      // stdin, stdout, stderr, data, and restart confirmations
      stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      env,
    };
    this.child = /** @type {PythonCallerChildProcess} */ (child_process.spawn(cmd, args, options));
    this.debug(`started child pid ${this.child.pid}`);

    this.child.stderr.setEncoding('utf8');
    this.child.stdout.setEncoding('utf8');
    this.child.stdio[3].setEncoding('utf8');
    this.child.stdio[4].setEncoding('utf8');

    this.child.stderr.on('data', this._handleStderrData.bind(this));
    this.child.stdout.on('data', this._handleStdoutData.bind(this));
    this.child.stdio[3].on('data', this._handleStdio3Data.bind(this));
    this.child.stdio[4].on('data', this._handleStdio4Data.bind(this));

    this.child.on('exit', this._handleChildExit.bind(this));
    this.child.on('error', this._handleChildError.bind(this));

    this.state = WAITING;
    this._checkState();
    this.debug('exit _startChild()');
  }

  _handleStderrData(data) {
    this.debug('enter _handleStderrData()');
    this.debug(`_handleStderrData(), data: ${data}`);
    this._checkState([IN_CALL, EXITING, WAITING]);
    if (this.state === IN_CALL) {
      this.outputStderr += data;
      this.outputBoth += data;
    } else {
      this._logError(`Unexpected STDERR data: ${data}`);
    }
    this.debug('exit _handleStderrData()');
  }

  _handleStdoutData(data) {
    this.debug('enter _handleStdoutData()');
    this._checkState([IN_CALL, EXITING]);
    if (this.state === IN_CALL) {
      this.outputStdout += data;
      this.outputBoth += data;
    } else {
      this._logError(`Unexpected STDOUT data: ${data}`);
    }
    this.debug('exit _handleStdoutData()');
  }

  _handleStdio3Data(data) {
    this.debug('enter _handleStdio3Data()');
    this._checkState([IN_CALL, EXITING]);
    if (this.state === IN_CALL) {
      this.outputData += data;
      if (this.outputData.indexOf('\n') >= 0) {
        this._callIsFinished();
      }
    }
    this.debug('exit _handleStdio3Data()');
  }

  _handleStdio4Data(data) {
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
    this.debug('exit _handleStdio3Data()');
  }

  _handleChildExit(code, signal) {
    this.debug('enter _handleChildExit()');
    this._checkState([WAITING, IN_CALL, EXITING]);
    delete activeCallers[this.uuid];
    if (this.state === WAITING) {
      this._logError(
        'PythonCaller child process exited while in state = WAITING, code = ' +
          String(code) +
          ', signal = ' +
          String(signal)
      );
      this.child = null;
      this.state = EXITED;
    } else if (this.state === IN_CALL) {
      this._clearTimeout();
      this.child = null;
      this.state = EXITED;
      this._callCallback(
        new Error(
          'PythonCaller child process exited unexpectedly, code = ' +
            String(code) +
            ', signal = ' +
            String(signal)
        )
      );
    } else if (this.state === EXITING) {
      // no error, this is the good case
      this.child = null;
      this.state = EXITED;
    }
    this.debug('exit _handleChildExit()');
  }

  _handleChildError(error) {
    this.debug('enter _handleChildError()');
    this._checkState([WAITING, IN_CALL, EXITING]);
    if (this.state === WAITING) {
      this._logError(
        'PythonCaller child process raised error while in state = WAITING, message = ' +
          String(error)
      );
      this.state = EXITING;
      this.child.kill('SIGTERM');
    } else if (this.state === IN_CALL) {
      this._logError(
        'PythonCaller child process raised error while in state = IN_CALL, message = ' +
          String(error)
      );
      this._clearTimeout();
      this.state = EXITING;
      this.child.kill('SIGTERM');
      const err = new Error('PythonCaller child process error: ' + String(error));
      this._callCallback(err);
    } else if (this.state === EXITING) {
      this._logError(
        'PythonCaller child process raised error while in state = EXITING, message = ' +
          String(error)
      );
    }
    this._checkState();
    this.debug('exit _handleChildError()');
  }

  _timeout() {
    this.debug('enter _timeout()');
    this._checkState([IN_CALL]);
    this.timeoutID = null;
    const err = new Error('timeout exceeded, killing PythonCaller child');
    this.child.kill('SIGTERM');
    this.state = EXITING;
    this._callCallback(err);
    this.debug('exit _timeout()');
  }

  _clearTimeout() {
    this.debug('enter _clearTimeout()');
    clearTimeout(this.timeoutID);
    this.timeoutID = null;
    this.debug('exit _clearTimeout()');
  }

  _restartTimeout() {
    this.debug('enter _restartTimeout()');
    this._checkState([RESTARTING]);
    this.timeoutID = null;
    const err = new Error('restart timeout exceeded, killing PythonCaller child');
    this.child.kill('SIGTERM');
    this.state = EXITING;
    this._callCallback(err);
    this.debug('exit _restartTimeout()');
  }

  _clearRestartTimeout() {
    this.debug('enter _clearRestartTimeout()');
    clearTimeout(this.timeoutID);
    this.timeoutID = null;
    this.debug('exit _clearRestartTimeout()');
  }

  _callCallback(err, data, output) {
    this.debug('enter _callCallback()');
    if (err) err.data = this._errorData();
    const c = this.callback;
    this.callback = null;
    c(err, data, output);
    this.debug('exit _callCallback()');
  }

  _callIsFinished() {
    this.debug('enter _callIsFinished()');
    if (!this._checkState([IN_CALL])) return;
    this._clearTimeout();
    let data,
      err = null;
    try {
      data = JSON.parse(this.outputData);
    } catch (e) {
      err = new Error('Error decoding PythonCaller JSON: ' + e.message);
    }
    if (err) {
      this.state = EXITING;
      this.child.kill('SIGTERM');
      this._callCallback(err);
    } else {
      this.state = WAITING;
      if (data.present) {
        this._callCallback(null, data.val, this.outputBoth);
      } else {
        this._callCallback(new FunctionMissingError('Function not found in module'));
      }
    }
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
    if (this.outputRestart.indexOf('\n') === -1) {
      // We haven't yet gotten enough output to know if the restart
      // was successful.
      return false;
    }
    try {
      const data = JSON.parse(this.outputRestart);
      return data.exited === true;
    } catch (e) {
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
    // restart, so we don't have to do any
    c(null, true);
    this.debug('exit _restartIsFinished()');
  }

  _errorData() {
    const errForStack = new Error();
    return {
      state: this.state,
      childIsNull: this.child == null,
      callbackIsNull: this.callback == null,
      timeoutIDIsNull: this.timeoutID == null,
      outputStdout: this.outputStdout,
      outputStderr: this.outputStderr,
      outputBoth: this.outputBoth,
      outputData: this.outputData,
      stack: errForStack.stack,
      lastCallData: this.lastCallData,
    };
  }

  _logError(msg) {
    this.debug('enter _logError()');
    const errData = this._errorData();
    logger.error(msg, errData);
    this.debug('exit _logError()');
    return false;
  }

  _checkState(allowedStates) {
    if (allowedStates && !allowedStates.includes(this.state)) {
      const allowedStatesList = '[' + _.map(allowedStates, String).join(',') + ']';
      return this._logError(
        'Expected PythonCaller states ' +
          allowedStatesList +
          ' but actually have state ' +
          String(this.state)
      );
    }

    let childNull, callbackNull, timeoutIDNull;
    if (this.state === CREATED) {
      childNull = true;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state === WAITING) {
      childNull = false;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state === IN_CALL) {
      childNull = false;
      callbackNull = false;
      timeoutIDNull = false;
    } else if (this.state === RESTARTING) {
      childNull = false;
      callbackNull = false;
      timeoutIDNull = false;
    } else if (this.state === EXITING) {
      childNull = false;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state === EXITED) {
      childNull = true;
      callbackNull = true;
      timeoutIDNull = true;
    } else {
      return this._logError('Invalid PythonCaller state: ' + String(this.state));
    }

    if (childNull != null) {
      if (childNull && this.child != null) {
        return this._logError(
          'PythonCaller state "' + String(this.state) + '": child should be null'
        );
      }
      if (!childNull && this.child == null) {
        return this._logError(
          'PythonCaller state "' + String(this.state) + '": child should not be null'
        );
      }
    }
    if (callbackNull != null) {
      if (callbackNull && this.callback != null) {
        return this._logError(
          'PythonCaller state "' + String(this.state) + '": callback should be null'
        );
      }
      if (!callbackNull && this.callback == null) {
        return this._logError(
          'PythonCaller state "' + String(this.state) + '": callback should not be null'
        );
      }
    }
    if (timeoutIDNull != null) {
      if (timeoutIDNull && this.timeoutID != null) {
        return this._logError(
          'PythonCaller state "' + String(this.state) + '": timeoutID should be null'
        );
      }
      if (!timeoutIDNull && this.timeoutID == null) {
        return this._logError(
          'PythonCaller state "' + String(this.state) + '": timeoutID should not be null'
        );
      }
    }

    return true;
  }
}

module.exports.FunctionMissingError = FunctionMissingError;
module.exports.PythonCaller = PythonCaller;

module.exports.waitForFinish = function (callback) {
  debug('enter waitForFinish()');
  const testFinished = () => {
    if (_.isEmpty(activeCallers)) {
      debug('exit waitForFinish()');
      return callback(null);
    }
    debug('still waiting for all pythonCallers to exit');
    setTimeout(testFinished, 100);
  };
  testFinished();
};
