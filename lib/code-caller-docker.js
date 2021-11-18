// @ts-check
const ERR = require('async-stacktrace');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { v4: uuidv4 } = require('uuid');
const Docker = require('dockerode');
const util = require('util');
const MemoryStream = require('memorystream');
const tmp = require('tmp-promise');
const child_process = require('child_process');
const { Mutex } = require('async-mutex');
const os = require('os');
const fs = require('fs-extra');
const execa = require('execa');

const config = require('./config');
const logger = require('./logger');
const { FunctionMissingError } = require('./code-caller-shared');
const dockerUtil = require('./dockerUtil');

/** @typedef {typeof CREATED | typeof WAITING | typeof IN_CALL | typeof EXITING | typeof EXITED} CallerState */
const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED = Symbol('EXITED');

const MOUNT_DIRECTORY_PREFIX = 'prairielearn-worker-';

const docker = new Docker();

let executorImageTag = 'latest';
async function updateExecutorImageTag() {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'development') {
    // In local dev mode, always use `latest` tag, as there isn't guaranteed
    // to be a version tagged with the current commit hash.
    executorImageTag = 'latest';
    return;
  }
  executorImageTag = (await execa('git', ['rev-parse', 'HEAD'])).stdout.trim();
}

function getExecutorImageName() {
  const imageName = config.workerExecutorImage || `prairielearn/executor:${executorImageTag}`;
  const { cacheImageRegistry } = config;
  if (cacheImageRegistry) {
    return `${cacheImageRegistry}/${imageName}`;
  }
  return imageName;
}

/**
 * Ensures that the required Docker image is present on this machine.
 * NOTE: in production, this will block code execution if the image isn't already
 * present locally. Every effort should be made to ensure that the current image has
 * already been pulled before PrairieLearn starts up.
 */
async function ensureImage() {
  const imageName = getExecutorImageName();
  const image = docker.getImage(imageName);
  try {
    await image.inspect();
  } catch (e) {
    if (e.statusCode === 404) {
      const dockerAuth = await dockerUtil.setupDockerAuthAsync();
      await docker.createImage(dockerAuth, { fromImage: imageName });
    } else {
      throw e;
    }
  }
}

/**
 *
 * @param {string} directory
 * @param {string} mountpoint
 */
async function createBindMount(directory, mountpoint) {
  if (process.platform === 'darwin') {
    // macOS
    await execa('bindfs', [directory, mountpoint]);
  } else if (process.platform === 'linux') {
    // linux
    await execa('mount', ['--bind', directory, mountpoint]);
  } else {
    throw new Error(`Unsupported platform for bind mounts: ${process.platform}`);
  }
}

/**
 *
 * @param {string} mountpoint
 */
async function removeBindMount(mountpoint) {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    await execa('umount', [mountpoint]);
  } else {
    throw new Error(`Unsupported platform for bind mounts: ${process.platform}`);
  }
}

class DockerCaller {
  constructor(options = { questionTimeoutMilliseconds: 5000 }) {
    /** @type {CallerState} */
    this.state = CREATED;
    this.uuid = uuidv4();

    this.debug('enter constructor()');

    /** @type {import('dockerode').Container} */
    this.container = null;
    this.callback = null;
    this.timeoutID = null;
    this.callCount = 0;
    this.ensureChildMutex = new Mutex();
    this.ensureDirectoryMutex = new Mutex();

    this.options = options;

    // this will accumulate stdout from the container
    this.output = '';

    // for error logging
    this.lastCallData = null;

    this.coursePath = null;

    this._checkState();

    this.debug(`exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`);
  }

  /**
   * Wrapper around `debug` that automatically includes UUID and the caller state.
   *
   * @param {string} message
   */
  debug(message) {
    const paddedState = this.state.toString().padEnd(15);
    debug(`[${this.uuid} ${paddedState}] ${message}`);
  }

  /**
   * Wrapper around `createBindMount` that includes instance-specific logs.
   *
   * @param {string} directory
   * @param {string} mountpoint
   */
  async createBindMount(directory, mountpoint) {
    this.debug(`creating bind mount for ${directory} at ${mountpoint}`);
    await createBindMount(directory, mountpoint);
    this.debug(`created bind mount for ${directory} at ${mountpoint}`);
  }

  /**
   * Wrapper around `removeBindMount` that includes instance-specific logs.
   *
   * @param {string} mountpoint
   */
  async removeBindMount(mountpoint) {
    this.debug(`removing bind mount at ${mountpoint}`);
    await removeBindMount(mountpoint);
    this.debug(`removed bind mount at ${mountpoint}`);
  }

  /**
   * Allows this caller to prepare for execution of code from a particular
   * course.
   *
   * @param {string} coursePath
   * @param {(err: Error | null | undefined) => void} callback
   */
  prepareForCourse(coursePath, callback) {
    util.callbackify(async () => {
      if (this.coursePath && this.coursePath === coursePath) {
        // Same course as before; we can reuse the existing setup
        return;
      }

      this.coursePath = coursePath;

      if (config.workersExecutionMode === 'container') {
        await this._ensureDirectoryIfNeeded();
        // If this Docker code caller was used before, we might have an existing
        // bind mount that we need to remove first. This should have been cleaned
        // up before, but if it wasn't, we'll do so here to avoid a
        // `mount point XXX is itself on a OSXFUSE volume` error.
        try {
          await this.removeBindMount(this.hostDirectory.path);
        } catch (e) {
          // If the above command failed, assume it because a mount point didn't
          // already exist and proceed as normal. If something is really messed
          // up, the next command will likely fail anyways.
        }
        await this.createBindMount(coursePath, this.hostDirectory.path);
      } else {
        throw new Error(`Unexpected worker execution mode "${config.workersExecutionMode}"`);
      }
    })(callback);
  }

  /**
   *
   * @param {'restart' | 'question' | 'course-element' | 'core-element'} type
   * @param {string} directory
   * @param {string} file
   * @param {string} fcn
   * @param {string[]} args
   * @param {(err: Error | null | undefined, data?: any, output?: string) => void} callback
   */
  call(type, directory, file, fcn, args, callback) {
    this.debug('enter call()');
    this.callCount += 1;
    this.ensureChild()
      .then(() => {
        if (!this._checkState([WAITING])) return callback(new Error('invalid DockerCaller state'));
        if (!this._checkReadyForCall()) return callback(new Error('not ready for call'));
        // TODO: state checking might be off. for the 'course' allocation method, we only start
        // containers when we know about the course. however, for the general case in prod, we can
        // start containers immediately on boot by "warming up". Need to make sure we actually do that,
        // and that it's handled correctly.

        const callData = { type, directory, file, fcn, args };
        const callDataString = JSON.stringify(callData);

        this.output = '';
        this.lastCallData = callData;
        this.callback = callback;

        // Starting Python processes is cheap, but starting a new Docker container is
        // relatively expensive. We'll set the container timeout to 1.5x the timeout
        // of the Python worker inside the container so that the container doesn't get
        // killed when user code times out, only when our worker running inside is truly
        // unresponsive.
        const containerTimeout = this.options.questionTimeoutMilliseconds * 1.5;
        this.timeoutID = setTimeout(this._handleTimeout.bind(this), containerTimeout);

        this.stdinStream.write(callDataString);
        this.stdinStream.write('\n');

        this.state = IN_CALL;
        this._checkState();
        this.debug('exit call()');
      })
      .catch((err) => callback(err));
  }

  /**
   *
   * @param {(err: Error | null | undefined, success?: boolean) => void} callback
   */
  restart(callback) {
    this.debug('enter restart()');
    if (!this._checkState([CREATED, WAITING, EXITING, EXITED])) {
      callback(new Error('Unexpected DockerCaller state'));
      return;
    }

    if (this.callCount === 0) {
      // If there weren't any calls since the last time this code caller
      // was restarted, we can slightly optimize things by skipping the
      // restart. This is safe, as no user-provided code will have been
      // loaded into the Python interpreter.
      this.debug(`exit restart() - skipping since no calls recorded since last restart`);
      callback(null, true);
    } else if (this.state === CREATED) {
      // no need to restart if we don't have a worker
      this.debug(`exit restart()`);
      callback(null, true);
    } else if (this.state === WAITING) {
      this.call('restart', null, null, 'restart', [], (err, ret_val, _consoleLog) => {
        this.coursePath = null;
        this.callCount = 0;
        if (ERR(err, callback)) return;
        if (ret_val !== 'success') return callback(new Error(`Error while restarting: ${ret_val}`));
        this.debug('exit restart()');
        callback(null, true);
      });
    } else if (this.state === EXITING || this.state === EXITED) {
      this.debug('exit restart()');
      callback(null, false);
    }
  }

  done() {
    this.debug('enter done()');
    this._checkState([CREATED, WAITING, EXITING, EXITED]);

    if (this.state === CREATED) {
      this.state = EXITED;
    } else if (this.state === WAITING) {
      this._cleanup();
      this.state = EXITING;
    }
    this._checkState();
    this.debug('exit done()');
  }

  async ensureChild() {
    this.debug('enter ensureChild()');
    this._checkState();

    // Since container creation is async, it's possible that ensureChild()
    // could be called again while it's already executing. For instance, we
    // could be inside a call that was made to warm up this worker, but then
    // we might have call() invoked, which will also call ensureChild(). We
    // need to ensure that we're only ever inside this function once at a time,
    // so we'll use a "mutex" (even though we're in a single-threaded environment).
    await this.ensureChildMutex.runExclusive(async () => {
      if (this.container) {
        this.debug('exit ensureChild() - existing container');
        return;
      }
      await ensureImage();
      await this._ensureDirectoryIfNeeded();
      await this._createAndAttachContainer();
      this.state = WAITING;
      this._checkState();
      this.debug('exit ensureChild()');
    });
  }

  async _ensureDirectoryIfNeeded() {
    await this.ensureDirectoryMutex.runExclusive(async () => {
      if (this.hostDirectory) return;
      this.hostDirectory = await tmp.dir({ unsafeCleanup: true, prefix: MOUNT_DIRECTORY_PREFIX });
    });
  }

  /**
   * Creates a container and attaches its stdin/stdout/stderr to streams
   * we can write to and read from.
   */
  async _createAndAttachContainer() {
    this.debug('enter _createAndAttachContainer');
    this.debug('_createAndAttachContainer(): creating container');
    let bindMount = `${this.hostDirectory.path}:/course:ro`;
    if (process.platform === 'linux') {
      // See https://docs.docker.com/storage/bind-mounts/#configure-bind-propagation
      // `bind-propagation-slave` is what allows the container to see the bind mount
      // we made on the host.
      //
      // We only apply this on Linux platforms, as it is unnecessary and actually
      // causes problems when running on macOS.
      bindMount += ',slave';
    }
    this.container = await docker.createContainer({
      name: `prairielearn.worker.${this.uuid}`,
      Image: getExecutorImageName(),
      OpenStdin: true,
      // This will close stdin once we disconnect, which will let
      // the worker know that they should die. Once the worker dies,
      // `AutoRemove: true` below will ensure the worker container
      // is removed.
      StdinOnce: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Binds: [bindMount],
        AutoRemove: true,
        // Prevent forkbombs
        PidsLimit: 64,
      },
      Env: [
        // Proxy the `DEBUG` environment variable to the container so we can
        // turn on debug logging for it
        `DEBUG=${process.env.DEBUG}`,
        // Inform the container of its timeout; this gets picked up by
        // `executor.js` and passed on to the PythonCodeCaller constructor.
        `QUESTION_TIMEOUT_MILLISECONDS=${this.options.questionTimeoutMilliseconds}`,
      ],
    });
    this.debug('_createAndAttachContainer(): created container');

    const stream = await this.container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });
    this.stdinStream = new MemoryStream();
    this.stdoutStream = new MemoryStream();
    this.stderrStream = new MemoryStream();
    this.stdinStream.pipe(stream);
    this.container.modem.demuxStream(stream, this.stdoutStream, this.stderrStream);
    this.stdoutStream.on('data', (data) => this._handleOutput(data));
    // TODO: we should really report stderr in logs
    // To see stderr from the container for debugging, uncomment the following line
    // this.stderrStream.pipe(process.stderr);

    this.debug('_createAndAttachContainer(): starting container');
    await this.container.start();
    this.debug('_createAndAttachContainer(): container started');

    // This will passively (non-blocking) wait for the container to exit or be killed, while allowing other code to keep executing
    this.container
      .wait()
      .then((status) => this._handleContainerExit(null, status))
      .catch((err) => this._handleContainerExit(err));
    this.debug('exit _createAndAttachContainer');
  }

  _handleOutput(data) {
    this.output += data;
    if (this.output.indexOf('\n') >= 0) {
      this._callIsFinished();
    }
  }

  _handleTimeout() {
    this.debug('enter _timeout()');
    this._checkState([IN_CALL]);
    this.timeoutID = null;
    this._cleanup();
    this.state = EXITING;
    this._callCallback(new Error('timeout exceeded, killing DockerCaller container'));
    this.debug('exit _timeout()');
  }

  _clearTimeout() {
    this.debug('enter _clearTimeout()');
    clearTimeout(this.timeoutID);
    this.timeoutID = null;
    this.debug('exit _clearTimeout()');
  }

  /**
   * Can be called asynchronously at any time if the container exits.
   *
   * @param {Error | null | undefined} err An error that occurred while waiting for the container to exit.
   * @param {number} [code] The status code that the container exited with
   */
  async _handleContainerExit(err, code) {
    this.debug('enter _handleContainerExit()');
    this._checkState([WAITING, IN_CALL, EXITING]);
    if (this.state === WAITING) {
      this._logError(
        `DockerCaller container exited while in state = WAITING, code = ${JSON.stringify(
          code
        )}, err = ${err}`
      );
      this.container = null;
      this.state = EXITED;
    } else if (this.state === IN_CALL) {
      this._clearTimeout();
      this.container = null;
      this.state = EXITED;
      this._callCallback(
        new Error(
          `DockerCaller container exited unexpectedly, code = ${JSON.stringify(code)}, err = ${err}`
        )
      );
    } else if (this.state === EXITING) {
      // no error, this is the good case
      this.container = null;
      this.state = EXITED;
    }
    this.debug('exit _handleContainerExit()');
  }

  /**
   * @param {Error & { data?: any }} err
   * @param {any} [data]
   * @param {string} [output]
   */
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
    /** @type {import('../executor').Results} */
    let data = null;
    let err = null;
    try {
      data = JSON.parse(this.output);
      if (data.error) {
        err = new Error(data.error);
        if (data.errorData && data.errorData.outputBoth) {
          this.outputBoth = data.errorData.outputBoth;
        }
      }
    } catch (e) {
      err = new Error('Error decoding DockerCaller JSON: ' + e.message);
    }
    this.state = WAITING;
    if (err) {
      this._callCallback(err);
    } else {
      if (data.functionMissing) {
        this._callCallback(new FunctionMissingError('Function not found in module'));
      } else {
        this._callCallback(null, data.data, data.output);
      }
    }
    this.debug('exit _callIsFinished()');
  }

  /**
   * Will prepare this worker to be completely disposed of. This will kill
   * the Docker container, clear the timeout, unmount the mounted directory
   * if needed, and finally remove the mounted directory.
   *
   * This function SHOULD NOT THROW as we're not guaranteed that anyone will be
   * able to catch the error. This makes a best-effort attempt to clean up all
   * the resources used by this caller, but it'll simply ignore any errors it
   * encounters.
   */
  async _cleanup() {
    this.debug('enter _cleanup()');
    if (this.timeoutID) {
      this._clearTimeout();
    }
    if (this.container) {
      try {
        await this.container.kill();
      } catch (e) {
        logger.error(e);
      }
    }
    // Note that we can't safely do any of this until the container is actually dead
    if (this.hostDirectory) {
      try {
        await this.removeBindMount(this.hostDirectory.path);
      } catch (e) {
        // Probably not mounted; swallow error
      }
      try {
        await this.hostDirectory.cleanup();
      } catch (e) {
        logger.error(e);
      }
    }
    this.debug('exit _cleanup()');
  }

  _errorData() {
    const errForStack = new Error();
    return {
      state: this.state,
      containerIsNull: this.container == null,
      callbackIsNull: this.callback == null,
      timeoutIDIsNull: this.timeoutID == null,
      outputBoth: this.outputBoth,
      stack: errForStack.stack,
      lastCallData: this.lastCallData,
    };
  }

  /**
   * @param {string} msg The message to log
   */
  _logError(msg) {
    this.debug('enter _logError()');
    const errData = this._errorData();
    logger.error(msg, errData);
    this.debug('exit _logError()');
    return false;
  }

  /**
   * Checks if the caller is ready for a call to call().
   *
   * @returns {boolean}
   */
  _checkReadyForCall() {
    if (!this.container) {
      return this._logError(
        `Not ready for call, container is not created (state: ${String(this.state)})`
      );
    }
    if (!this.coursePath) {
      return this._logError(
        `Not ready for call, course was not set (state: ${String(this.state)})`
      );
    }
    return true;
  }

  /**
   * Checks that the caller is in a good state.
   *
   * @param {CallerState[]} [allowedStates]
   */
  _checkState(allowedStates) {
    if (allowedStates && !allowedStates.includes(this.state)) {
      const allowedStatesList = allowedStates.map(String).join(', ');
      return this._logError(
        `Expected DockerCaller to be in states [${allowedStatesList}] but actually have state ${String(
          this.state
        )}`
      );
    }

    let containerNull, callbackNull, timeoutIDNull;
    if (this.state === CREATED) {
      containerNull = true;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state === WAITING) {
      containerNull = false;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state === IN_CALL) {
      containerNull = false;
      callbackNull = false;
      timeoutIDNull = false;
    } else if (this.state === EXITING) {
      containerNull = false;
      callbackNull = true;
      timeoutIDNull = true;
    } else if (this.state === EXITED) {
      containerNull = true;
      callbackNull = true;
      timeoutIDNull = true;
    } else {
      return this._logError(`Invalid DockerCaller state: ${String(this.state)}`);
    }

    if (containerNull != null) {
      if (containerNull && this.container != null) {
        return this._logError(`DockerCaller state ${String(this.state)}: container should be null`);
      }
      if (!containerNull && this.container == null) {
        return this._logError(
          `DockerCaller state ${String(this.state)}: container should not be null`
        );
      }
    }
    if (callbackNull != null) {
      if (callbackNull && this.callback != null) {
        return this._logError(`DockerCaller state ${String(this.state)}: callback should be null`);
      }
      if (!callbackNull && this.callback == null) {
        return this._logError(
          `DockerCaller state ${String(this.state)}: callback should not be null`
        );
      }
    }
    if (timeoutIDNull != null) {
      if (timeoutIDNull && this.timeoutID != null) {
        return this._logError(`DockerCaller state ${String(this.state)}: timeoutID should be null`);
      }
      if (!timeoutIDNull && this.timeoutID == null) {
        return this._logError(
          `DockerCaller state ${String(this.state)}: timeoutID should not be null`
        );
      }
    }

    return true;
  }
}

module.exports.DockerCaller = DockerCaller;

/**
 * If PrairieLearn dies unexpectedly, we may leave around temporary directories
 * that should have been removed. This function will perform a best-effort
 * attempt to clean them up, but will allow execution to continue if something
 * fails. It'll check for any directories in the OS tmp directory that match the
 * pattern of our tmp directory names, try to unmount them, and then remove the
 * directories.
 *
 * This function is run on startup in the `init()` function below.
 */
async function cleanupMountDirectories() {
  try {
    const tmpDir = os.tmpdir();
    // Enumerate all directories in the OS tmp directory and remove
    // any old ones
    const dirs = await fs.readdir(tmpDir);
    const ourDirs = dirs.filter((d) => d.indexOf(MOUNT_DIRECTORY_PREFIX) === 0);
    for (const dir of ourDirs) {
      const absolutePath = path.join(tmpDir, dir);
      // Attempt to unmount and remove
      try {
        debug(`removing bind mount at ${absolutePath}`);
        await removeBindMount(absolutePath);
      } catch (e) {
        // Ignore this, it was hopefully unmounted successfully before
      }
      try {
        await fs.rmdir(absolutePath);
      } catch (e) {
        logger.error(`Failed to remove temporary directory ${absolutePath}`);
        logger.error(e);
      }
    }
  } catch (e) {
    logger.error(e);
  }
}

module.exports.init = async function init() {
  await cleanupMountDirectories();
  await updateExecutorImageTag();
  if (config.ensureExecutorImageAtStartup) {
    await ensureImage();
  }
};
