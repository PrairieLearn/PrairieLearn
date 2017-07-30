const ERR = require('async-stacktrace');
const async = require('async');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const debug = require('debug')('code-caller');

const logger = require('../lib/logger');

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');

/*
  Usage
  =====
  
  Create a new PythonCaller object, then do call() repeatedly and wait
  for each call to finish, then do done() to finish.


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

          pc.exit();
      });
  });


  Notes
  =====

  - PythonCaller uses a lazy-start model where the child process isn't
    started until the first call(), so it's cheap to create a
    PythonCaller object and never use it.

  - It is safe to call exit() even if call() was never called.


  State machine
  =============

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
        this.child = null;
        this.callback = null;
        this.timeoutID = null;

        // variables to accumulate child output
        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';
        this.outputData = '';

        this.state = CREATED;
        this.checkState();
        debug('exit constructor(), state: ' + String(this.state));
    }

    call(file, fcn, args, options, callback) {
        debug('enter call(), state: ' + String(this.state));
        if (!this.checkState([CREATED, WAITING])) return callback(new Error('invalid state'));

        if (this.state == CREATED) {
            this.startChild();
        }

        const localOptions = _.defaults(options, {
            cwd: __dirname,
            paths: [],
            timeout: 5000,
        });
        const input = JSON.stringify({
            file, fcn, args,
            cwd: localOptions.cwd,
            paths: localOptions.paths,
        });
        this.callback = callback;
        this.timeoutID = setTimeout(this.timeout.bind(this), localOptions.timeout);

        this.child.stdin.write(input);
        this.child.stdin.write('\n');

        this.state = IN_CALL;
        this.checkState();
        debug('exit call(), state: ' + String(this.state));
    }

    done() {
        debug('enter done(), state: ' + String(this.state));
        this.checkState([CREATED, WAITING]);

        if (this.state == CREATED) {
            this.state = EXITED;
        } else if (this.state == WAITING) {
            this.child.kill();
            this.state = EXITING;
        }
        this.checkState();
        debug('exit done(), state: ' + String(this.state));
    }

    startChild() {
        debug('enter startChild(), state: ' + String(this.state));
        this.checkState([CREATED]);
        
        const cmd = 'python3';
        const args = [path.join(__dirname, 'python_caller.py')];
        const options = {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, and an extra one for data
        };
        this.child = child_process.spawn(cmd, args, options);

        this.child.stderr.setEncoding('utf8');
        this.child.stdout.setEncoding('utf8');
        this.child.stdio[3].setEncoding('utf8');

        this.child.stderr.on('data', this.handleStderrData.bind(this));
        this.child.stdout.on('data', this.handleStdoutData.bind(this));
        this.child.stdio[3].on('data', this.handleStdio3Data.bind(this));
        
        this.child.on('exit', this.handleChildExit.bind(this));
        this.child.on('error', this.handleChildError.bind(this));

        this.state = WAITING;
        this.checkState();
        debug('exit startChild(), state: ' + String(this.state));
    }

    handleStderrData(data) {
        debug('enter handleStderrData(), state: ' + String(this.state));
        this.checkState([IN_CALL, EXITING]);
        if (this.state == IN_CALL) {
            this.outputStderr += data;
            this.outputBoth += data;
        }
        debug('exit handleStderrData(), state: ' + String(this.state));
    }

    handleStdoutData(data) {
        debug('enter handleStdoutData(), state: ' + String(this.state));
        this.checkState([IN_CALL, EXITING]);
        if (this.state == IN_CALL) {
            this.outputStdout += data;
            this.outputBoth += data;
        }
        debug('exit handleStdoutData(), state: ' + String(this.state));
    }

    handleStdio3Data(data) {
        debug('enter handleStdio3Data(), state: ' + String(this.state));
        this.checkState([IN_CALL, EXITING]);
        if (this.state == IN_CALL) {
            this.outputData += data;
            if (this.outputData.indexOf('\n') >= 0) {
                this.callFinished();
            }
        }
        debug('exit handleStdio3Data(), state: ' + String(this.state));
    }

    handleChildExit(code, signal) {
        debug('enter handleChildExit(), state: ' + String(this.state));
        this.checkState([WAITING, IN_CALL, EXITING]);
        if (this.state == WAITING) {
            this.logError('child process exited while in state = WAITING, code = ' + String(code) + ', signal = ' + String(signal));
            this.child = null;
            this.state = EXITED;
        } else if (this.state == IN_CALL) {
            this.clearTimeout();
            this.child = null;
            this.state = EXITED;
            this.callCallback(new Error('child process exited unexpectedly, code = ' + String(code) + ', signal = ' + String(signal)));
        } else if (this.state == EXITING) {
            // no error, this is the good case
            this.child = null;
            this.state = EXITED;
        }
        debug('exit handleChildExit(), state: ' + String(this.state));
    }

    handleChildError(error) {
        debug('enter handleChildError(), state: ' + String(this.state));
        this.checkState([WAITING, IN_CALL, EXITING]);
        if (this.state == WAITING) {
            this.logError('child process raised error while in state = WAITING, message = ' + String(error));
            this.state = EXITING;
            this.child.kill('SIGKILL');
        } else if (this.state == IN_CALL) {
            this.logError('child process raised error while in state = IN_CALL, message = ' + String(error));
            this.clearTimeout();
            this.state = EXITING;
            this.child.kill('SIGKILL');
            const err = new Error('child process error: ' + String(error));
            this.callCallback(err);
        } else if (this.state == EXITING) {
            this.logError('child process raised error while in state = EXITING, message = ' + String(error));
        }
        this.checkState();
        debug('exit handleChildError(), state: ' + String(this.state));
    }

    timeout() {
        debug('enter timeout(), state: ' + String(this.state));
        this.checkState([IN_CALL]);
        this.timeoutID = null;
        const err = new Error('timeout exceeded, killing child');
        this.child.kill('SIGKILL');
        this.state = EXITING;
        this.callCallback(err);
        debug('exit timeout(), state: ' + String(this.state));
    }

    clearTimeout() {
        debug('enter clearTimeout(), state: ' + String(this.state));
        clearTimeout(this.timeoutID);
        this.timeoutID = null;
        debug('exit clearTimeout(), state: ' + String(this.state));
    }

    callCallback(err, data, output) {
        debug('enter callCallback(), state: ' + String(this.state));
        if (err) {
            err.data = {
                state: String(this.state),
                childNull: (this.child == null),
                callbackNull: (this.callback == null),
                timeoutIDNull: (this.timeoutID == null),
                outputStdout: this.outputStdout,
                outputStderr: this.outputStderr,
                outputBoth: this.outputBoth,
                outputData: this.outputData,
            };
        }
        const c = this.callback;
        this.callback = null;
        c(err, data, output);
        debug('exit callCallback(), state: ' + String(this.state));
    }

    callFinished() {
        debug('enter callFinished(), state: ' + String(this.state));
        if (!this.checkState([IN_CALL])) return;
        this.clearTimeout();
        let data, err = null;
        try {
            data = JSON.parse(this.outputData);
        } catch (e) {
            err = new Error('Error decoding question JSON: ' + e.message);
        }
        if (err) {
            this.state = EXITING;
            this.child.kill('SIGKILL');
            this.callCallback(err);
        } else {
            this.state = WAITING;
            this.callCallback(null, data, this.outputBoth);
        }
        debug('exit callFinished(), state: ' + String(this.state));
    }

    logError(msg) {
        debug('enter logError(), state: ' + String(this.state));
        const err = new Error();
        const errData = {
            msg: msg,
            state: this.state,
            childNull: (this.child == null),
            callbackNull: (this.callback == null),
            timeoutIDNull: (this.timeoutID == null),
            outputStdout: this.outputStdout,
            outputStderr: this.outputStderr,
            outputBoth: this.outputBoth,
            outputData: this.outputData,
            stack: err.stack,
        };
        logger.error(msg, errData);
        debug('exit logError(), state: ' + String(this.state));
    }

    checkState(allowedStates) {
        if (allowedStates && !allowedStates.includes(this.state)) {
            const allowedStatesList = '[' + _.map(allowedStates, String).join(',') + ']';
            return this.logError('Expected states ' + allowedStatesList + ' but actually have state ' + String(this.state));
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
            return this.logError('Invalid state: ' + String(state));
        }

        if (childNull != null) {
            if (childNull && this.child != null) return this.logError('state "' + String(this.state) + '": child should be null');
            if (!childNull && this.child == null) return this.logError('state "' + String(this.state) + '": child should not be null');
        }
        if (callbackNull != null) {
            if (callbackNull && this.callback != null) return this.logError('state "' + String(this.state) + '": callback should be null');
            if (!callbackNull && this.callback == null) return this.logError('state "' + String(this.state) + '": callback should not be null');
        }
        if (timeoutIDNull != null) {
            if (timeoutIDNull && this.timeoutID != null) return this.logError('state "' + String(this.state) + '": timeoutID should be null');
            if (!timeoutIDNull && this.timeoutID == null) return this.logError('state "' + String(this.state) + '": timeoutID should not be null');
        }

        return true;
    }
}

module.exports.PythonCaller = PythonCaller;
