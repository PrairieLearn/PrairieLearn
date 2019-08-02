// @ts-check
const ERR = require('async-stacktrace');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const uuidv4 = require('uuid/v4');
const Docker = require('dockerode');
const util = require('util');
const MemoryStream = require('memorystream');
const tmp = require('tmp-promise');
const child_process = require('child_process');

const config = require('./config');
const logger = require('./logger');
const { FunctionMissingError } = require('./code-caller-python');

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');

// TODO: make configurable
const workerImage = 'prairielearn/executor';

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
        child.stdout.on('data', (chunk) => process.stdout.write(chunk));
        child.stderr.on('data', (chunk) => process.stderr.write(chunk));
        child.on('close', (code) => {
            if (finished) return;
            finished = true;
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Child process exited with code ${code}`));
            }
        });
        child.on('error', (err) => {
            if (finished) return;
            finished = true;
            reject(err);
        });
    });
}

async function createBindMount(directory, mountpoint) {
    console.log('ARGS', arguments);
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

class DockerCaller {
    constructor() {
        debug('enter constructor()');

        this.uuid = uuidv4();
        debug(`uuid: ${this.uuid}`);
        this.container = null;
        this.callback = null;
        this.timeoutID = null;

        // variables to accumulate container output
        this.output = '';

        // for error logging
        this.lastCallData = null;

        // start with a null course
        this.course = null;

        this.state = CREATED;
        // this._checkState();

        debug(`exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    prepareForCourse(course, callback) {
        util.callbackify(async () => {
            if (this.course && this.course.path === course.path) {
                // Same course as before; we can reuse the existing setup
                return;
            }

            this.course = course;

            if (config.workersExecutionMode === 'container') {
                // If we're running in Docker, that means we're making use of static
                // docker mounts instead of messing with bind mounts on the host.

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
            } else if (config.workersExecutionMode === 'native') {
                await this._ensureDirectoryIfNeeded();
                await createBindMount(course.path, this.hostDirectory.path);
            } else {
                throw new Error(`Unexpected worker execution mode "${config.workersExecutionMode}"`);
            }

            this.state = WAITING;
        })(callback);
    }

    call(type, directory, file, fcn, args, options, callback) {
        debug(`enter call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        // if (!this._checkState([CREATED, WAITING])) return callback(new Error('invalid PythonCaller state'));

        this.ensureChild().then(() => {
            // TODO: state checking might be off. for the 'course' allocation method, we only start
            // containers when we know about the course. however, for the general case in prod, we can
            // start containers immediately on boot by "warming up". Need to make sure we actually do that,
            // and that it's handled correctly.

            let cwd;
            let paths = ['/python'];
            if (type === 'question') {
                cwd = path.posix.join('/course', 'questions', directory);
                paths.push('/course/serverFilesCourse');
            } else if (type === 'course-element') {
                cwd = path.join('/course', 'elements', directory);
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

            this.stdinStream.write(callDataString);
            this.stdinStream.write('\n');
            console.log('WROTE');

            this.state = IN_CALL;
            // this._checkState();
            debug(`exit call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        }).catch(err => callback(err));
    }

    restart(callback) {
        debug(`enter restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        // this._checkState([CREATED, WAITING, EXITING, EXITED]);

        if (this.state == CREATED) {
            // no need to restart if we don't have a worker
            debug(`exit restart(), state: ${String(this.state)}, uuid: ${this.uuid}`);
            callback(null, true);
        } else if (this.state == WAITING) {
            this.call('restart', null, null, 'restart', [], {}, (err, ret_val, _consoleLog) => {
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
        // this._checkState([CREATED, WAITING, EXITING, EXITED]);

        if (this.hostDirectory) {
            this.hostDirectory.cleanup();
        }
        if (this.state == CREATED) {
            this.state = EXITED;
        } else if (this.state == WAITING) {
            this.container.kill().catch(err => logger.error(err));
            this.state = EXITING;
        }
        // this._checkState();
        debug(`exit done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }
    
    async ensureChild() {
        if (config.workersExecutionMode === 'container') {
            // We can't actually set up a container until we know which course
            // we'll be running, since we have to bind mount the actual path
            // of the course
            return;
        }

        if (this.container) {
            // We already have a working container
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
    }

    async _ensureDirectoryIfNeeded() {
        if (config.workersExecutionMode === 'native' && !this.hostDirectory) {
            this.hostDirectory = await tmp.dir({ unsafeCleanup: true, prefix: 'prairielearn-worker-' });
        }
    }

    /**
     * Ensures that the required Docker image is present on this machine.
     */
    async _ensureImage() {
        const image = docker.getImage(workerImage);
        try {
            await image.inspect();
        } catch (e) {
            if (e.statusCode === 404) {
                await docker.pull(workerImage, {});
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
            Image: workerImage,
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
        this.stderrStream.pipe(process.stderr);

        await this.container.start();

        // We don't await this right here; we passively wait for it to exit
        // TODO: actually handle this?
        this.container.wait().then((data) => console.log(data)).catch((err) => console.error(err));
    }

    _handleOutput(data) {
        this.output += data;
        if (this.output.indexOf('\n') >= 0) {
            console.log('==done==');
            console.log('"' + this.output + '"');
            console.log('===done===');
            this._callIsFinished();
        }
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
        // if (!this._checkState([IN_CALL])) return;
        // this._clearTimeout();
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
            err = new Error('Error decoding PythonCaller JSON: ' + e.message);
        }
        if (err) {
            this.state = EXITING;
            this._callCallback(err);
        } else {
            this.state = WAITING;
            if (data.functionMissing) {
                this._callCallback(new FunctionMissingError('Function not found in module'));
            } else {
                this._callCallback(null, data.data, data.output);
            }
        }
        debug(`exit _callIsFinished(), state: ${String(this.state)}, uuid: ${this.uuid}`);
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
}

module.exports.DockerCaller = DockerCaller;
