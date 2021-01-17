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

const config = require('./config');
const logger = require('./logger');
const { FunctionMissingError } = require('./code-caller-python');

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');

/** @typedef {typeof CREATED | typeof WAITING | typeof IN_CALL | typeof EXITING | typeof EXITED} CallerState */

let executorImageVersion = 'latest';
module.exports.setExecutorImageVersion = function(version) {
    executorImageVersion = version;
};

function getExecutorImageName() {
    return `prairielearn/executor:${executorImageVersion}`;
}

// TODO: make configurable?
const MOUNT_DIRECTORY_PREFIX = 'prairielearn-worker-';

const docker = new Docker();

/**
 * Spawns a child process and waits for it to finish. Resolves if
 * the child process exits with exit code 0, otherwise rejects.
 * 
 * @param {string} command
 * @param {string[]} args
 */
function spawnAsync(command, args) {
    return new Promise((resolve, reject) => {
        const child  = child_process.spawn(command, args);
        let finished = false;
        // To see stdout/stderr from the child process, uncomment the following two lines
        child.stdout.on('data', (chunk) => process.stdout.write(chunk));
        child.stderr.on('data', (chunk) => process.stderr.write(chunk));
        child.on('close', (code) => {
            if (finished) return;
            finished = true;
            if (code === 0) {
                resolve();
            } else {
                process.stderr.write(`${command} ${args.join(' ')}\n`);
                reject(new Error(`Child process ${command} exited with code ${code}`));
            }
        });
        child.on('error', (err) => {
            if (finished) return;
            finished = true;
            reject(err);
        });
    });
}

/**
 * 
 * @param {string} directory 
 * @param {string} mountpoint 
 */
async function createBindMount(directory, mountpoint) {
    debug(`creating bind mount for ${directory} at ${mountpoint}`);
    if (process.platform === 'darwin') {
        // macOS
        await spawnAsync('bindfs', [directory, mountpoint]);
    } else if (process.platform === 'linux') {
        // linux
        await spawnAsync('mount', ['--bind', directory, mountpoint]);
    } else {
        throw new Error(`Unsupported platform for bind mounts: ${process.platform}`);
    }
}

/**
 * 
 * @param {string} mountpoint 
 */
async function removeBindMount(mountpoint) {
    debug(`removing bind mount at ${mountpoint}`);
    if (process.platform === 'darwin') {
        await spawnAsync('umount', [mountpoint]);
    } else if (process.platform === 'linux') {
        await spawnAsync('fusermount', ['-u', mountpoint]);
    } else {
        throw new Error(`Unsupported platform for bind mounts: ${process.platform}`);
    }
}

class DockerCaller {
    constructor() {
        debug('enter constructor()');

        this.uuid = uuidv4();
        this.container = null;
        this.callback = null;
        this.timeoutID = null;
        this.ensureChildMutex = new Mutex();
        this.ensureDirectoryMutex = new Mutex();

        // this will accumulate stdout from the container
        this.output = '';

        // for error logging
        this.lastCallData = null;

        this.course = null;

        /** @type {CallerState} */
        this.state = CREATED;
        this._checkState();

        debug(`exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    /**
     * Allows this caller to prepare for execution of code from a particular
     * course.
     *
     * @param {{ path: string }} course 
     * @param {(err: Error | null | undefined) => void} callback 
     */
    prepareForCourse(course, callback) {
        util.callbackify(async () => {
            if (!this._checkState([CREATED, WAITING])) throw new Error(`Invalid caller state: ${String(this.state)}`);
            if (this.course) {
                if (this.course.path === course.path) {
                    // Same course as before; we can reuse the existing setup
                    return;
                } else if (config.workersExecutionMode === 'container') {
                    throw new Error(`DockerCaller is already allocated for course "${this.course.path}"`);
                }
            }

            this.course = course;

            if (config.workersExecutionMode === 'container') {
                // If we're running in Docker, that means we're making use of static
                // docker mounts instead of messing with bind mounts on the host.

                if (this.container) {
                    // We already have a container proeprly allocated for this course
                    return;
                }

                const elementsHostDir = path.join(process.env.HOSTFILES_DIR, 'elements');
                const pythonHostDir = path.join(process.env.HOSTFILES_DIR, 'python');
                let courseDir;
                if (course.path === '/PrairieLearn/exampleCourse') {
                    // TODO: can we get away without hardcoding this? I don't think so, but...
                    courseDir = path.join(process.env.HOSTFILES_DIR, 'exampleCourse');
                } else {
                    // TODO: make this better? maybe?
                    // The `course` object we have here has been normalized relative to the
                    // config we need to reference. Specifically, `course.path` is absolute,
                    // whereas the course directories in `config.courseDirs` (and thus the
                    // keys in `config.courseDirsHost`) could be relative. Therefore, we'll
                    // establish a mapping from noramlized course names to the paths in
                    // `config.courseDirs`, and use those to look up directories in
                    // `config.courseDirsHost`.
                    const originalNames = new Map(config.courseDirs.map(c => [path.resolve(c), c]));
                    const originalDirectory = originalNames.get(course.path);
                    courseDir = config.courseDirsHost[originalDirectory];
                    if (!courseDir) {
                        throw new Error(`No host directory specified for course at ${course.path}`);
                    }
                }

                await this._ensureImage();
                const binds = [
                    `${elementsHostDir}:/elements:ro`,
                    `${pythonHostDir}:/python:ro`,
                    `${courseDir}:/course:ro`,
                ];
                await this._createAndAttachContainer(binds);
                this.state = WAITING;
            } else if (config.workersExecutionMode === 'native') {
                await this._ensureDirectoryIfNeeded();
                // If this Docker code caller was used before, we might have an existing
                // bind mount that we need to remove first. This should have been cleaned
                // up before, but if it wasn't, we'll do so here to avoid a
                // `mount point XXX is itself on a OSXFUSE volume` error.
                try {
                    await removeBindMount(this.hostDirectory.path);
                } catch (e) {
                    // If the above command failed, assume it because a mount point didn't
                    // already exist and proceed as normal. If something is really messed
                    // up, the next command will likely fail anyways.
                }
                await createBindMount(course.path, this.hostDirectory.path);
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
        debug(`enter call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this.ensureChild().then(() => {
            if (!this._checkState([WAITING])) return callback(new Error('invalid DockerCaller state'));
            if (!this._checkReadyForCall()) return callback(new Error('not ready for call'));
            // TODO: state checking might be off. for the 'course' allocation method, we only start
            // containers when we know about the course. however, for the general case in prod, we can
            // start containers immediately on boot by "warming up". Need to make sure we actually do that,
            // and that it's handled correctly.

            let cwd = null;
            let paths = ['/python'];
            if (type === 'question') {
                cwd = path.posix.join('/course', 'questions', directory);
                paths.push('/course/serverFilesCourse');
            } else if (type === 'course-element') {
                cwd = path.join('/course', 'elements', directory);
                paths.push('/course/serverFilesCourse');
            } else if (type === 'core-element') {
                cwd = path.posix.join('/elements', directory);
            } else if (type === 'restart') {
                // Doesn't need a working directory
            } else {
                callback(new Error(`Unknown function call type: ${type}`));
                return;
            }

            const callData = { file, fcn, args, cwd, paths };
            const callDataString = JSON.stringify(callData);

            this.output = '';
            this.lastCallData = callData;
            this.callback = callback;
            // TODO: how long should timeout actually be?
            // TODO: I think the best option here is to make this timeout longer (1.5x?)
            // than the timeout in the worker. Starting python processes is cheap,
            // but starting a new Docker container is relatively expensive. By allowing
            // the container worker to timeout on bad python code, we'll receive that as
            // a normal error during call(). The timeout at this level of the code should
            // only kick in if a container goes completely unresponsive, at which point we
            // have no choice but to kill it and start over.
            // We can probably make the Docker worker take the timeout as an option so that
            // we don't have to coordinate hardcoded timeouts in two places.
            this.timeoutID = setTimeout(this._handleTimeout.bind(this), 5000);

            this.stdinStream.write(callDataString);
            this.stdinStream.write('\n');

            this.state = IN_CALL;
            this._checkState();
            debug(`exit call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        }).catch(err => callback(err));
    }

    /**
     * 
     * @param {(err: Error | null | undefined, success?: boolean) => void} callback 
     */
    restart(callback) {
        debug(`enter restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        if (!this._checkState([CREATED, WAITING, EXITING, EXITED])) {
            callback(new Error('Unexpected DockerCaller state'));
            return;
        }

        if (this.state == CREATED) {
            // no need to restart if we don't have a worker
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            callback(null, true);
        } else if (this.state == WAITING) {
            this.call('restart', null, null, 'restart', [], (err, ret_val, _consoleLog) => {
                this.course = null;
                if (ERR(err, callback)) return;
                if (ret_val != 'success') return callback(new Error(`Error while restarting: ${ret_val}`));
                debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
                callback(null, true);
            });
        } else if (this.state == EXITING || this.state == EXITED) {
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            callback(null, false);
        }
    }

    done() {
        debug(`enter done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([CREATED, WAITING, EXITING, EXITED]);

        if (this.state == CREATED) {
            this.state = EXITED;
        } else if (this.state == WAITING) {
            this._cleanup();
            this.state = EXITING;
        }
        this._checkState();
        debug(`exit done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }
    
    async ensureChild() {
        debug(`enter ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState();
        if (config.workersExecutionMode === 'container') {
            // If we're running in 'container' mode, we can't actually set up
            // a container until we know which course we'll be running, since
            // we have to bind mount the actual path of the course
            debug(`exit ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            return;
        }

        // This will only execute if we're in `native` mode.
        // Since container creation is async, it's possible that ensureChild()
        // could be called again while it's already executing. For instance, we
        // could be inside a call that was made to warm up this worker, but then
        // we might have call() invoked, which will also call ensureChild(). We
        // need to ensure that we're only ever inside this function once at a time,
        // so we'll use a "mutex" (even though we're in a single-threaded environment).
        await this.ensureChildMutex.runExclusive(async () => {
            if (this.container) {
                debug(`exit ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
                return;
            }
            await this._ensureImage();
            const elementsHostDir = path.join(__dirname, '..', 'elements');
            const pythonHostDir = path.join(__dirname, '..', 'python');
            await this._ensureDirectoryIfNeeded();
            const binds = [
                `${elementsHostDir}:/elements:ro`,
                `${pythonHostDir}:/python:ro`,
                `${this.hostDirectory.path}:/course:ro`,
            ];
            await this._createAndAttachContainer(binds);
            this.state = WAITING;
            this._checkState();
            debug(`exit ensureChild(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        });
    }

    async _ensureDirectoryIfNeeded() {
        await this.ensureDirectoryMutex.runExclusive(async () => {
            if (config.workersExecutionMode === 'native' && !this.hostDirectory) {
                this.hostDirectory = await tmp.dir({ unsafeCleanup: true, prefix: MOUNT_DIRECTORY_PREFIX });
            }
        });
    }

    /**
     * Ensures that the required Docker image is present on this machine.
     * NOTE: in production, this will block code execution if the image isn't already
     * present locally. Every effort should be made to ensure that the current image has
     * already been pulled before PrairieLearn starts up.
     */
    async _ensureImage() {
        const image = docker.getImage(getExecutorImageName());
        try {
            await image.inspect();
        } catch (e) {
            if (e.statusCode === 404) {
                await docker.pull(getExecutorImageName(), {});
            } else {
                throw e;
            }
        }
    }

    /**
     * Creates a container and attaches its stdin/stdout/stderr to streams
     * we can write to and read from.
     * 
     * @param {string[]} binds - The bind mounts for the container
     */
    async _createAndAttachContainer(binds) {
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
                Binds: binds,
                AutoRemove: true,
            },
            Env: [
                // Proxy the `DEBUG` environment variable to the container so we can
                // turn on debug logging for it
                `DEBUG=${process.env.DEBUG}`,
            ],
        });

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
        this.stdoutStream.on('data', data => this._handleOutput(data));
        // To see stderr from the container for debugging, uncomment the following line
        this.stderrStream.pipe(process.stderr);

        await this.container.start();

        // This will passively wait for the container to exit or be killed
        this.container
            .wait()
            .then((status) => this._handleContainerExit(null, status))
            .catch((err) => this._handleContainerExit(err));
    }

    _handleOutput(data) {
        this.output += data;
        if (this.output.indexOf('\n') >= 0) {
            this._callIsFinished();
        }
    }

    _handleTimeout() {
        debug(`enter _timeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([IN_CALL]);
        this.timeoutID = null;
        this._cleanup();
        this.state = EXITING;
        this._callCallback(new Error('timeout exceeded, killing DockerCaller container'));
        debug(`exit _timeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _clearTimeout() {
        debug(`enter _clearTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        clearTimeout(this.timeoutID);
        this.timeoutID = null;
        debug(`exit _clearTimeout(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    /**
     * Can be called asynchronously at any time if the container exits.
     * 
     * @param {Error | null | undefined} err An error that occurred while waiting for the container to exit.
     * @param {number} [code] The status code that the container exited with
     */
    async _handleContainerExit(err, code) {
        debug(`enter _handleContainerExit(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        this._checkState([WAITING, IN_CALL, EXITING]);
        if (this.state == WAITING) {
            this._logError(`DockerCaller container exited while in state = WAITING, code = ${code}, err = ${err}`);
            this.container = null;
            this.state = EXITED;
        } else if (this.state == IN_CALL) {
            this._clearTimeout();
            this.container = null;
            this.state = EXITED;
            this._callCallback(new Error(`DockerCaller container exited unexpectedly, code = ${code}, err = ${err}`));
        } else if (this.state == EXITING) {
            // no error, this is the good case
            this.container = null;
            this.state = EXITED;
        }
        debug(`exit _handleContainerExit(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    /**
     * @param {Error & { data?: any }} err 
     * @param {any} [data]
     * @param {string} [output]
     */
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
            data = JSON.parse(this.output);
            if (data.error) {
                err = new Error(data.error);
                if (data.data && data.data.outputBoth) {
                    /** @type {string} */
                    this.outputBoth = data.data.outputBoth;
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
        debug(`exit _callIsFinished(), state: ${String(this.state)}, uuid: ${this.uuid}`);
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
        debug(`enter _cleanup(), state: ${String(this.state)}, uuid: ${this.uuid}`);
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
                await removeBindMount(this.hostDirectory.path);
            } catch (e) {
                // Probably not mounted; swallow error
            }
            try {
                await this.hostDirectory.cleanup();
            } catch (e) {
                logger.error(e);
            }
        }
        debug(`exit _cleanup(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    _errorData() {
        const errForStack = new Error();
        return {
            state: this.state,
            containerIsNull: (this.container == null),
            callbackIsNull: (this.callback == null),
            timeoutIDIsNull: (this.timeoutID == null),
            outputBoth: this.outputBoth,
            stack: errForStack.stack,
            lastCallData: this.lastCallData,
        };
    }

    /**
     * @param {string} msg The message to log
     */
    _logError(msg) {
        debug(`enter _logError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        const errData = this._errorData();
        logger.error(msg, errData);
        debug(`exit _logError(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        return false;
    }

    /**
     * Checks if the caller is ready for a call to call().
     *
     * @returns {boolean}
     */
    _checkReadyForCall() {
        if (!this.container) {
            return this._logError(`Not ready for call, container is not created (state: ${String(this.state)})`);
        }
        if (!this.course) {
            return this._logError(`Not ready for call, course was not set (state: ${String(this.state)})`);
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
            return this._logError(`Expected DockerCaller to be in states [${allowedStatesList}] but actually have state ${String(this.state)}`);
        }

        let containerNull, callbackNull, timeoutIDNull;
        if (this.state == CREATED) {
            containerNull = true;
            callbackNull = true;
            timeoutIDNull = true;
        } else if (this.state == WAITING) {
            containerNull = false;
            callbackNull = true;
            timeoutIDNull = true;
        } else if (this.state == IN_CALL) {
            containerNull = false;
            callbackNull = false;
            timeoutIDNull = false;
        } else if (this.state == EXITING) {
            containerNull = false;
            callbackNull = true;
            timeoutIDNull = true;
        } else if (this.state == EXITED) {
            containerNull = true;
            callbackNull = true;
            timeoutIDNull = true;
        } else {
            return this._logError(`Invalid DockerCaller state: ${String(this.state)}`);
        }

        if (containerNull != null) {
            if (containerNull && this.container != null) return this._logError(`DockerCaller state ${String(this.state)}: container should be null`);
            if (!containerNull && this.container == null) return this._logError(`DockerCaller state ${String(this.state)}: container should not be null`);
        }
        if (callbackNull != null) {
            if (callbackNull && this.callback != null) return this._logError(`DockerCaller state ${String(this.state)}: callback should be null`);
            if (!callbackNull && this.callback == null) return this._logError(`DockerCaller state ${String(this.state)}: callback should not be null`);
        }
        if (timeoutIDNull != null) {
            if (timeoutIDNull && this.timeoutID != null) return this._logError(`DockerCaller state ${String(this.state)}: timeoutID should be null`);
            if (!timeoutIDNull && this.timeoutID == null) return this._logError(`DockerCaller state ${String(this.state)}: timeoutID should not be null`);
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
 * This function should be run on startup before workers are initialized.
 */
module.exports.cleanupMountDirectories = async function cleanupHostDirectories() {
    if (config.workersExecutionMode !== 'native') {
        // We won't have any directories to clean up
        return;
    }
    try {
        const tmpDir = os.tmpdir();
        // Enumerage all directories in the OS tmp directory and remove
        // any old ones
        const dirs = await fs.readdir(tmpDir);
        const ourDirs = dirs.filter(d => d.indexOf(MOUNT_DIRECTORY_PREFIX) === 0);
        for (const dir of ourDirs) {
            const absolutePath = path.join(tmpDir, dir);
            // Attempt to unmount and remove
            try {
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
};
