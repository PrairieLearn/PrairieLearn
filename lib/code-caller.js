const ERR = require('async-stacktrace');
const _ = require('lodash');
const path = require('path');
const child_process = require('child_process');
const uuidv4 = require('uuid/v4');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('./config');
const logger = require('./logger');
const load = require('./load');

const activeCallers = {};

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');

class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

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
    -> IN_CALL, EXITING, EXITED

  IN_CALL: A call is currently running.
    -> WAITING, EXITING, EXITED

  EXITING: The child process is being terminated.
    -> EXITED

  EXITED: The child process has exited.
    -> none

*/
class PythonCaller {
    constructor() {
        debug('enter constructor()');
        this.uuid = uuidv4();
        debug(`uuid: ${this.uuid}`);
        this.child = null;
        this.callback = null;
        this.timeoutID = null;

        // variables to accumulate child output
        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';
        this.outputData = '';

        // for error logging
        this.lastCallData = null;

        this.state = CREATED;
        this._checkState();

        debug(`exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    call(file, fcn, args, options, callback) {
        debug(`enter call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        if (!this._checkState([CREATED, WAITING])) return callback(new Error('invalid PythonCaller state'));

        if (this.state == CREATED) {
            this._startChild();
        }

        const localOptions = _.defaults(options, {
            cwd: __dirname,
            paths: [],
            timeout: 20000, // FIXME: this number (equivalent to 20 seconds) should not have to be this high
        });
        const callData = {
            file, fcn, args,
            cwd: localOptions.cwd,
            paths: localOptions.paths,
        };
        const callDataString = JSON.stringify(callData);
        this.callback = callback;
        this.timeoutID = setTimeout(this._timeout.bind(this), localOptions.timeout);

        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';
        this.outputData = '';

        this.lastCallData = callData;

        this.child.stdin.write(callDataString);
        this.child.stdin.write('\n');

        this.state = IN_CALL;
        this._checkState();
        debug(`exit call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    /*
     * @param {function} callback - A callback(err, success) function. If 'success' is false then this PythonCaller should be discarded and a new one created by the parent.
     */
    restart(callback) {
        debug(`enter restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([CREATED, WAITING, EXITING, EXITED]);

        if (!config.useWorkers) {
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            return callback(new Error('cannot restart when useWorkers=false'));
        }
        if (this.state == CREATED) {
            // no need to restart if we don't have a worker
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            callback(null, true);
        } else if (this.state == WAITING) {
            this.call(null, 'restart', [], {}, (err, ret_val, _consoleLog) => {
                if (ERR(err, callback)) return;
                if (ret_val != 'success') return callback(new Error(`Error while restarting: ${ret_val}`));
                debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
                callback(null, true);
            });
        } else if (this.state == EXITING || this.state == EXITED) {
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            callback(null, false);
        } else {
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            callback(new Error(`invalid state ${this.state}`));
        }
    }

    done() {
        debug(`enter done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([CREATED, WAITING, EXITING, EXITED]);

        if (this.state == CREATED) {
            this.state = EXITED;
        } else if (this.state == WAITING) {
            this.child.kill();
            this.state = EXITING;
        }
        this._checkState();
        debug(`exit done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    ensureChild() {
        debug(`enter ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState();

        if (this.state == CREATED) {
            this._startChild();
        }

        this._checkState();
        debug(`exit ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _startChild() {
        debug(`enter _startChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([CREATED]);
        load.startJob('python', this.uuid);
        activeCallers[this.uuid] = this;

        const cmd = 'python3';
        var pythonTrampoline;
        if (config.useWorkers) {
            pythonTrampoline = path.join(__dirname, 'python-caller-trampoline.py');
        } else {
            pythonTrampoline = path.join(__dirname, 'python-caller-trampoline-no-fork.py');
        }
        const args = ['-B', pythonTrampoline];
        const env = _.clone(process.env);
        // PYTHONIOENCODING might not be needed once we switch to Python 3.7
        // https://www.python.org/dev/peps/pep-0538/
        // https://www.python.org/dev/peps/pep-0540/
        env.PYTHONIOENCODING = 'utf-8';
        const options = {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, and an extra one for data
            env,
        };
        this.child = child_process.spawn(cmd, args, options);
        debug(`started child pid ${this.child.pid}, uuid: ${this.uuid}`);

        this.child.stderr.setEncoding('utf8');
        this.child.stdout.setEncoding('utf8');
        this.child.stdio[3].setEncoding('utf8');

        this.child.stderr.on('data', this._handleStderrData.bind(this));
        this.child.stdout.on('data', this._handleStdoutData.bind(this));
        this.child.stdio[3].on('data', this._handleStdio3Data.bind(this));

        this.child.on('exit', this._handleChildExit.bind(this));
        this.child.on('error', this._handleChildError.bind(this));

        this.state = WAITING;
        this._checkState();
        debug(`exit _startChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _handleStderrData(data) {
        debug(`enter _handleStderrData(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        debug(`_handleStderrData(), data: ${data}`);
        this._checkState([IN_CALL, EXITING, WAITING]);
        if (this.state == IN_CALL) {
            this.outputStderr += data;
            this.outputBoth += data;
        } else {
            this._logError(`Unexpected STDERR data: ${data}`);
        }
        debug(`exit _handleStderrData(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _handleStdoutData(data) {
        debug(`enter _handleStdoutData(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([IN_CALL, EXITING]);
        if (this.state == IN_CALL) {
            this.outputStdout += data;
            this.outputBoth += data;
        } else {
            this._logError(`Unexpected STDOUT data: ${data}`);
        }
        debug(`exit _handleStdoutData(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _handleStdio3Data(data) {
        debug(`enter _handleStdio3Data(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([IN_CALL, EXITING]);
        if (this.state == IN_CALL) {
            this.outputData += data;
            if (this.outputData.indexOf('\n') >= 0) {
                this._callIsFinished();
            }
        }
        debug(`exit _handleStdio3Data(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _handleChildExit(code, signal) {
        debug(`enter _handleChildExit(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([WAITING, IN_CALL, EXITING]);
        load.endJob('python', this.uuid);
        delete activeCallers[this.uuid];
        if (this.state == WAITING) {
            this._logError('PythonCaller child process exited while in state = WAITING, code = ' + String(code) + ', signal = ' + String(signal));
            this.child = null;
            this.state = EXITED;
        } else if (this.state == IN_CALL) {
            this._clearTimeout();
            this.child = null;
            this.state = EXITED;
            this._callCallback(new Error('PythonCaller child process exited unexpectedly, code = ' + String(code) + ', signal = ' + String(signal)));
        } else if (this.state == EXITING) {
            // no error, this is the good case
            this.child = null;
            this.state = EXITED;
        }
        debug(`exit _handleChildExit(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _handleChildError(error) {
        debug(`enter _handleChildError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([WAITING, IN_CALL, EXITING]);
        if (this.state == WAITING) {
            this._logError('PythonCaller child process raised error while in state = WAITING, message = ' + String(error));
            this.state = EXITING;
            this.child.kill('SIGTERM');
        } else if (this.state == IN_CALL) {
            this._logError('PythonCaller child process raised error while in state = IN_CALL, message = ' + String(error));
            this._clearTimeout();
            this.state = EXITING;
            this.child.kill('SIGTERM');
            const err = new Error('PythonCaller child process error: ' + String(error));
            this._callCallback(err);
        } else if (this.state == EXITING) {
            this._logError('PythonCaller child process raised error while in state = EXITING, message = ' + String(error));
        }
        this._checkState();
        debug(`exit _handleChildError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _timeout() {
        debug(`enter _timeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([IN_CALL]);
        this.timeoutID = null;
        const err = new Error('timeout exceeded, killing PythonCaller child');
        this.child.kill('SIGTERM');
        this.state = EXITING;
        this._callCallback(err);
        debug(`exit _timeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _clearTimeout() {
        debug(`enter _clearTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        clearTimeout(this.timeoutID);
        this.timeoutID = null;
        debug(`exit _clearTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _callCallback(err, data, output) {
        debug(`enter _callCallback(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        if (err) err.data = this._errorData();
        const c = this.callback;
        this.callback = null;
        c(err, data, output);
        debug(`exit _callCallback(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _callIsFinished() {
        debug(`enter _callIsFinished(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        if (!this._checkState([IN_CALL])) return;
        this._clearTimeout();
        let data, err = null;
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
        debug(`exit _callIsFinished(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _errorData() {
        const errForStack = new Error();
        return {
            state: this.state,
            childIsNull: (this.child == null),
            callbackIsNull: (this.callback == null),
            timeoutIDIsNull: (this.timeoutID == null),
            outputStdout: this.outputStdout,
            outputStderr: this.outputStderr,
            outputBoth: this.outputBoth,
            outputData: this.outputData,
            stack: errForStack.stack,
            lastCallData: this.lastCallData,
        };
    }

    _logError(msg) {
        debug(`enter _logError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        const errData = this._errorData();
        logger.error(msg, errData);
        debug(`exit _logError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        return false;
    }

    _checkState(allowedStates) {
        if (allowedStates && !allowedStates.includes(this.state)) {
            const allowedStatesList = '[' + _.map(allowedStates, String).join(',') + ']';
            return this._logError('Expected PythonCaller states ' + allowedStatesList + ' but actually have state ' + String(this.state));
        }

        let childNull, callbackNull, timeoutIDNull;
        if (this.state == CREATED) {
            childNull = true;
            callbackNull = true;
            timeoutIDNull = true;
        } else if (this.state == WAITING) {
            childNull = false;
            callbackNull = true;
            timeoutIDNull = true;
        } else if (this.state == IN_CALL) {
            childNull = false;
            callbackNull = false;
            timeoutIDNull = false;
        } else if (this.state == EXITING) {
            childNull = false;
            callbackNull = true;
            timeoutIDNull = true;
        } else if (this.state == EXITED) {
            childNull = true;
            callbackNull = true;
            timeoutIDNull = true;
        } else {
            return this._logError('Invalid PythonCaller state: ' + String(this.state));
        }

        if (childNull != null) {
            if (childNull && this.child != null) return this._logError('PythonCaller state "' + String(this.state) + '": child should be null');
            if (!childNull && this.child == null) return this._logError('PythonCaller state "' + String(this.state) + '": child should not be null');
        }
        if (callbackNull != null) {
            if (callbackNull && this.callback != null) return this._logError('PythonCaller state "' + String(this.state) + '": callback should be null');
            if (!callbackNull && this.callback == null) return this._logError('PythonCaller state "' + String(this.state) + '": callback should not be null');
        }
        if (timeoutIDNull != null) {
            if (timeoutIDNull && this.timeoutID != null) return this._logError('PythonCaller state "' + String(this.state) + '": timeoutID should be null');
            if (!timeoutIDNull && this.timeoutID == null) return this._logError('PythonCaller state "' + String(this.state) + '": timeoutID should not be null');
        }

        return true;
    }
}

module.exports.FunctionMissingError = FunctionMissingError;
module.exports.PythonCaller = PythonCaller;

module.exports.waitForFinish = function(callback) {
    debug('enter waitForFinish()');
    const testFinished = () => {
        if (_.size(activeCallers) == 0) {
            debug('exit waitForFinish()');
            return callback(null);
        }
        debug('still waiting for all pythonCallers to exit');
        setTimeout(testFinished, 100);
    };
    testFinished();
};
