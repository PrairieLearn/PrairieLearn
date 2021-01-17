import ERR from "async-stacktrace";
import * as _ from "lodash";
import path from "path";
import child_process from "child_process";
import uuidv4 from "uuid/v4";
const debug = require("debug")(
  "prairielearn:" + path.basename(__filename, ".js")
);

const activeCallers: { [key: string]: PythonCaller } = {};

enum CallerState {
  CREATED = "CREATED",
  WAITING = "WAITING",
  IN_CALL = "IN_CALL",
  RESTARTING = "RESTARTING",
  EXITING = "EXITING",
  EXITED = "EXITED",
}

type CallerCallback = (err: Error, data?: any, output?: string) => void;

interface CallerOptions {
  cwd?: string;
  paths?: string[];
  timeout?: number;
}

class DataError extends Error {
  data?: any;
  constructor(message: string) {
    super(message);
    this.name = "DataError";
  }
}

class FunctionMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FunctionMissingError";
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

  CallerState.CREATED: Child process is not yet started.
    -> CallerState.WAITING, CallerState.EXITED

  CallerState.WAITING: Child process is running but no call is active, everything is healthy.
    -> CallerState.IN_CALL, CallerState.RESTARTING, CallerState.EXITING, CallerState.EXITED

  CallerState.IN_CALL: A call is currently running.
    -> CallerState.WAITING, CallerState.EXITING, CallerState.EXITED

  RESTARTING: The worker is restarting; waiting for confirmation of successful restart.
    -> CallerState.WAITING, CallerState.EXITING

  CallerState.EXITING: The child process is being terminated.
    -> CallerState.EXITED

  CallerState.EXITED: The child process has CallerState.EXITED.
    -> none

*/
class PythonCaller {
  uuid: string;
  child: child_process.ChildProcess;
  callback: CallerCallback;
  timeoutID: NodeJS.Timeout;

  outputStdout: string;
  outputStderr: string;
  outputBoth: string;
  outputData: string;
  outputRestart: string;

  lastCallData: any;

  state: CallerState;

  constructor() {
    debug("enter constructor()");
    this.uuid = uuidv4();
    debug(`uuid: ${this.uuid}`);
    this.child = null;
    this.callback = null;
    this.timeoutID = null;

    // variables to accumulate child output
    this.outputStdout = "";
    this.outputStderr = "";
    this.outputBoth = "";
    this.outputData = "";
    this.outputRestart = "";

    // for error logging
    this.lastCallData = null;

    this.state = CallerState.CREATED;
    this._checkState();

    debug(
      `exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  call(
    file: string,
    fcn: string,
    args: any[],
    options: CallerOptions,
    callback: CallerCallback
  ) {
    debug(`enter call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    if (!this._checkState([CallerState.CREATED, CallerState.WAITING]))
      return callback(new Error("invalid PythonCaller state"));

    if (this.state == CallerState.CREATED) {
      this._startChild();
    }

    const localOptions = _.defaults(options, {
      cwd: __dirname,
      paths: [],
      timeout: 20000, // FIXME: this number (equivalent to 20 seconds) should not have to be this high
    });
    const callData = {
      file,
      fcn,
      args,
      cwd: localOptions.cwd,
      paths: localOptions.paths,
    };
    const callDataString = JSON.stringify(callData);
    this.callback = callback;
    this.timeoutID = setTimeout(this._timeout.bind(this), localOptions.timeout);

    this.outputStdout = "";
    this.outputStderr = "";
    this.outputBoth = "";
    this.outputData = "";
    this.outputRestart = "";

    this.lastCallData = callData;

    this.child.stdin.write(callDataString);
    this.child.stdin.write("\n");

    this.state = CallerState.IN_CALL;
    this._checkState();
    debug(`exit call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
  }

  /*
   * @param {function} callback - A callback(err, success) function. If 'success' is false then this PythonCaller should be discarded and a new one CallerState.CREATED by the parent.
   */
  restart(callback: (err: Error, success?: boolean) => void) {
    debug(`enter restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    this._checkState([
      CallerState.CREATED,
      CallerState.WAITING,
      CallerState.EXITING,
      CallerState.EXITED,
    ]);

    if (this.state == CallerState.CREATED) {
      // no need to restart if we don't have a worker
      debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
      callback(null, true);
    } else if (this.state == CallerState.WAITING) {
      this.call(null, "restart", [], {}, (err, ret_val, _consoleLog) => {
        if (ERR(err, callback)) return;
        if (ret_val != "success")
          return callback(new Error(`Error while restarting: ${ret_val}`));
        debug(
          `exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`
        );

        this.state = CallerState.RESTARTING;
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
        // callback(null, true);
      });
    } else if (
      this.state == CallerState.EXITING ||
      this.state == CallerState.EXITED
    ) {
      debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
      callback(null, false);
    } else {
      debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
      callback(new Error(`invalid state ${this.state}`));
    }
  }

  done() {
    debug(`enter done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    this._checkState([
      CallerState.CREATED,
      CallerState.WAITING,
      CallerState.EXITING,
      CallerState.EXITED,
    ]);

    if (this.state == CallerState.CREATED) {
      this.state = CallerState.EXITED;
    } else if (this.state == CallerState.WAITING) {
      this.child.kill();
      this.state = CallerState.EXITING;
    }
    this._checkState();
    debug(`exit done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
  }

  ensureChild() {
    debug(
      `enter ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
    this._checkState();

    if (this.state == CallerState.CREATED) {
      this._startChild();
    }

    this._checkState();
    debug(
      `exit ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  _startChild() {
    debug(
      `enter _startChild(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
    this._checkState([CallerState.CREATED]);
    activeCallers[this.uuid] = this;

    const cmd = "python3";
    const pythonZygote = "/python/zygote.py";
    const args = ["-B", pythonZygote];
    const env = _.clone(process.env);
    // PYTHONIOENCODING might not be needed once we switch to Python 3.7
    // https://www.python.org/dev/peps/pep-0538/
    // https://www.python.org/dev/peps/pep-0540/
    env.PYTHONIOENCODING = "utf-8";
    const options: child_process.SpawnOptions = {
      cwd: __dirname,
      // stdin, stdout, stderr, and two extra ones for data and exit confirmations
      stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
      env,
    };
    this.child = child_process.spawn(cmd, args, options);
    debug(`started child pid ${this.child.pid}, uuid: ${this.uuid}`);

    this.child.stderr.setEncoding("utf8");
    this.child.stdout.setEncoding("utf8");
    // @ts-ignore
    this.child.stdio[3].setEncoding("utf8");
    // @ts-ignore
    this.child.stdio[4].setEncoding("utf8");

    this.child.stderr.on("data", this._handleStderrData.bind(this));
    this.child.stdout.on("data", this._handleStdoutData.bind(this));
    this.child.stdio[3].on("data", this._handleStdio3Data.bind(this));
    this.child.stdio[4].on("data", this._handleStdio4Data.bind(this));

    this.child.on("exit", this._handleChildExit.bind(this));
    this.child.on("error", this._handleChildError.bind(this));

    this.state = CallerState.WAITING;
    this._checkState();
    debug(
      `exit _startChild(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  _handleStderrData(data: string) {
    debug(
      `enter _handleStderrData(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    debug(`_handleStderrData(), data: ${data}`);
    this._checkState([
      CallerState.IN_CALL,
      CallerState.EXITING,
      CallerState.WAITING,
    ]);
    if (this.state == CallerState.IN_CALL) {
      this.outputStderr += data;
      this.outputBoth += data;
    } else {
      this._logError(`Unexpected STDERR data: ${data}`);
    }
    debug(
      `exit _handleStderrData(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _handleStdoutData(data: string) {
    debug(
      `enter _handleStdoutData(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    this._checkState([CallerState.IN_CALL, CallerState.EXITING]);
    if (this.state == CallerState.IN_CALL) {
      this.outputStdout += data;
      this.outputBoth += data;
    } else {
      this._logError(`Unexpected STDOUT data: ${data}`);
    }
    debug(
      `exit _handleStdoutData(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _handleStdio3Data(data: string) {
    debug(
      `enter _handleStdio3Data(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    this._checkState([CallerState.IN_CALL, CallerState.EXITING]);
    if (this.state == CallerState.IN_CALL) {
      this.outputData += data;
      if (this.outputData.indexOf("\n") >= 0) {
        this._callIsFinished();
      }
    }
    debug(
      `exit _handleStdio3Data(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _handleStdio4Data(data: string) {
    debug(
      `enter _handleStdio4Data(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    // Unlike in other calls, we'll allow data in any state since this data
    // will come in outside the normal "call" flow and isn't guaranteed to
    // be received in the RESTARTING state.
    this.outputRestart += data;

    // If this data is received while not in the RESTARTING state, it will
    // be handled by the restart() function itself.
    if (this.state == CallerState.RESTARTING && this._restartWasSuccessful()) {
      this._restartIsFinished();
    }
    debug(
      `exit _handleStdio4Data(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _handleChildExit(code: number, signal: string) {
    debug(
      `enter _handleChildExit(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    this._checkState([
      CallerState.WAITING,
      CallerState.IN_CALL,
      CallerState.EXITING,
    ]);
    delete activeCallers[this.uuid];
    if (this.state == CallerState.WAITING) {
      this._logError(
        "PythonCaller child process exited while in state = CallerState.WAITING, code = " +
          String(code) +
          ", signal = " +
          String(signal)
      );
      this.child = null;
      this.state = CallerState.EXITED;
    } else if (this.state == CallerState.IN_CALL) {
      this._clearTimeout();
      this.child = null;
      this.state = CallerState.EXITED;
      this._callCallback(
        new Error(
          "PythonCaller child process exited unexpectedly, code = " +
            String(code) +
            ", signal = " +
            String(signal)
        )
      );
    } else if (this.state == CallerState.EXITING) {
      // no error, this is the good case
      this.child = null;
      this.state = CallerState.EXITED;
    }
    debug(
      `exit _handleChildExit(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _handleChildError(error: Error) {
    debug(
      `enter _handleChildError(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    this._checkState([
      CallerState.WAITING,
      CallerState.IN_CALL,
      CallerState.EXITING,
    ]);
    if (this.state == CallerState.WAITING) {
      this._logError(
        "PythonCaller child process raised error while in state = CallerState.WAITING, message = " +
          String(error)
      );
      this.state = CallerState.EXITING;
      this.child.kill("SIGTERM");
    } else if (this.state == CallerState.IN_CALL) {
      this._logError(
        "PythonCaller child process raised error while in state = CallerState.IN_CALL, message = " +
          String(error)
      );
      this._clearTimeout();
      this.state = CallerState.EXITING;
      this.child.kill("SIGTERM");
      const err = new Error(
        "PythonCaller child process error: " + String(error)
      );
      this._callCallback(err);
    } else if (this.state == CallerState.EXITING) {
      this._logError(
        "PythonCaller child process raised error while in state = CallerState.EXITING, message = " +
          String(error)
      );
    }
    this._checkState();
    debug(
      `exit _handleChildError(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _timeout() {
    debug(`enter _timeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    this._checkState([CallerState.IN_CALL]);
    this.timeoutID = null;
    const err = new Error("timeout exceeded, killing PythonCaller child");
    this.child.kill("SIGTERM");
    this.state = CallerState.EXITING;
    this._callCallback(err);
    debug(`exit _timeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
  }

  _clearTimeout() {
    debug(
      `enter _clearTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
    clearTimeout(this.timeoutID);
    this.timeoutID = null;
    debug(
      `exit _clearTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  _restartTimeout() {
    debug(
      `enter _restartTimeout(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    this._checkState([CallerState.RESTARTING]);
    this.timeoutID = null;
    const err = new Error(
      "restart timeout exceeded, killing PythonCaller child"
    );
    this.child.kill("SIGTERM");
    this.state = CallerState.EXITING;
    this._callCallback(err);
    debug(
      `exit _restartTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  _clearRestartTimeout() {
    debug(
      `enter _clearRestartTimeout(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    clearTimeout(this.timeoutID);
    this.timeoutID = null;
    debug(
      `exit _clearRestartTimeout(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
  }

  _callCallback(err: Error, data?: any, output?: string) {
    debug(
      `enter _callCallback(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
    if (err) data = this._errorData();
    const c = this.callback;
    this.callback = null;
    c(err, data, output);
    debug(
      `exit _callCallback(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  _callIsFinished() {
    debug(
      `enter _callIsFinished(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    if (!this._checkState([CallerState.IN_CALL])) return;
    this._clearTimeout();
    let data,
      err = null;
    try {
      data = JSON.parse(this.outputData);
    } catch (e) {
      err = new Error("Error decoding PythonCaller JSON: " + e.message);
    }
    if (err) {
      this.state = CallerState.EXITING;
      this.child.kill("SIGTERM");
      this._callCallback(err);
    } else {
      this.state = CallerState.WAITING;
      if (data.present) {
        this._callCallback(null, data.val, this.outputBoth);
      } else {
        this._callCallback(
          new FunctionMissingError("Function not found in module")
        );
      }
    }
    debug(
      `exit _callIsFinished(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
  }

  /**
   * Returns true if a restart was successfully confirmed. A return value of
   * false doesn't necessarily mean that the restart has failed; we just may
   * not yet have enough information to determine if it was successful. We
   * always let the restart timeout handle the unsuccessful case to simplify
   * code.
   */
  _restartWasSuccessful() {
    if (this.outputRestart.indexOf("\n") === -1) {
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
    debug(
      `enter _restartIsFinished(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
    if (!this._checkState([CallerState.RESTARTING])) return;
    this._clearRestartTimeout();
    this.state = CallerState.WAITING;
    const c = this.callback;
    this.callback = null;
    // This function is guaranteed to only be called if there was a successful
    // restart, so we don't have to do any
    c(null, true);
    debug(
      `exit _restartIsFinished(), state: ${String(this.state)}, uuid: ${
        this.uuid
      }`
    );
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

  _logError(msg: string) {
    debug(
      `enter _logError(), state: ${String(this.state)}, uuid: ${this.uuid}`
    );
    const errData = this._errorData();
    console.error(msg, errData);
    debug(`exit _logError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    return false;
  }

  _checkState(allowedStates: CallerState[] = null) {
    if (allowedStates && !allowedStates.includes(this.state)) {
      const allowedStatesList =
        "[" + _.map(allowedStates, String).join(",") + "]";
      return this._logError(
        "Expected PythonCaller states " +
          allowedStatesList +
          " but actually have state " +
          String(this.state)
      );
    }

    let childNull, callbackNull, timeoutIDNull;
    if (this.state == CallerState.CREATED) {
      childNull = true;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state == CallerState.WAITING) {
      childNull = false;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state == CallerState.IN_CALL) {
      childNull = false;
      callbackNull = false;
      timeoutIDNull = false;
    } else if (this.state == CallerState.EXITING) {
      childNull = false;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state == CallerState.EXITED) {
      childNull = true;
      callbackNull = true;
      timeoutIDNull = true;
    } else {
      return this._logError(
        "Invalid PythonCaller state: " + String(this.state)
      );
    }

    if (childNull != null) {
      if (childNull && this.child != null)
        return this._logError(
          'PythonCaller state "' +
            String(this.state) +
            '": child should be null'
        );
      if (!childNull && this.child == null)
        return this._logError(
          'PythonCaller state "' +
            String(this.state) +
            '": child should not be null'
        );
    }
    if (callbackNull != null) {
      if (callbackNull && this.callback != null)
        return this._logError(
          'PythonCaller state "' +
            String(this.state) +
            '": callback should be null'
        );
      if (!callbackNull && this.callback == null)
        return this._logError(
          'PythonCaller state "' +
            String(this.state) +
            '": callback should not be null'
        );
    }
    if (timeoutIDNull != null) {
      if (timeoutIDNull && this.timeoutID != null)
        return this._logError(
          'PythonCaller state "' +
            String(this.state) +
            '": timeoutID should be null'
        );
      if (!timeoutIDNull && this.timeoutID == null)
        return this._logError(
          'PythonCaller state "' +
            String(this.state) +
            '": timeoutID should not be null'
        );
    }

    return true;
  }
}

export { FunctionMissingError, PythonCaller, CallerCallback, CallerOptions };

export function waitForFinish(callback: (err?: Error) => void) {
  debug("enter waitForFinish()");
  const testFinished = () => {
    if (_.size(activeCallers) == 0) {
      debug("exit waitForFinish()");
      return callback(null);
    }
    debug("still CallerState.WAITING for all pythonCallers to exit");
    setTimeout(testFinished, 100);
  };
  testFinished();
}
