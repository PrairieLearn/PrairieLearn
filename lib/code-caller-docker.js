const ERR = require('async-stacktrace');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const uuidv4 = require('uuid/v4');
const Docker = require('dockerode');
const util = require('util');
const MemoryStream = require('memorystream');

const logger = require('./logger');
const { FunctionMissingError } = require('./code-caller-python');

const CREATED = Symbol('CREATED');
const WAITING = Symbol('WAITING');
const IN_CALL = Symbol('IN_CALL');
const EXITING = Symbol('EXITING');
const EXITED  = Symbol('EXITED');

// TODO make configurable
const runningInDocker = true;
const workerImage = 'prairielearn/executor';

const docker = new Docker();

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
        if (this.course && this.course.path === course.path) {
            // Same course as before; we can reuse the existing setup
            callback(null);
            return;
        }
        this.course = course;

        util.callbackify(async () => {
            const image = docker.getImage(workerImage);
            try {
                await image.inspect();
            } catch (e) {
                if (e.statusCode === 404) {
                    await docker.pull(workerImage);
                } else {
                    throw e;
                }
            }

            if (runningInDocker) {
                // If we're running in Docker, that means we're making use of static
                // docker mounts instead of messing with bind mounts on the host.

                const elementsHostDir = path.join(process.env.HOSTFILES_DIR, 'elements');
                const pythonHostDir = path.join(process.env.HOSTFILES_DIR, 'python');
                let courseDir;
                if (course.path === '/PrairieLearn/exampleCourse') {
                    courseDir = path.join(process.env.HOSTFILES_DIR, 'exampleCourse');
                } else {
                    throw new Error('TODO: add support for other courses');
                }

                this.container = await docker.createContainer({
                    Image: workerImage,
                    OpenStdin: true,
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                    HostConfig: {
                        Binds: [
                            `${elementsHostDir}:/elements`,
                            `${pythonHostDir}:/python`,
                            `${courseDir}:/course`,
                        ],
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
                // TODO actually handle this
                this.container.wait().then((data) => console.log(data)).catch((err) => console.error(err));

                this.state = WAITING;
            } else {
                // We're running on the host
                // TODO bind mounts; can probably reuse some of above code
                // Most importantly, we need to reuse the same container for perf if we can
            }
        })(callback);
    }

    call(type, directory, file, fcn, args, options, callback) {
        debug(`enter call(), state: ${String(this.state)}, uuid: ${this.uuid}`);
        // if (!this._checkState([CREATED, WAITING])) return callback(new Error('invalid PythonCaller state'));

        if (this.state == CREATED) {
            this._startChild();
        }

        // TODO: state checking might be off. for the 'course' allocation method, we only start
        // containers when we know about the course. however, for the general case in prod, we can
        // start containers immediately on boot by "warming up". Need to make sure we actually do that,
        // and that it's handled correctly.

        let cwd;
        if (type === 'question') {
            cwd = path.posix.join('/course', 'questions', directory);
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

        const callData = {
            file, fcn, args, cwd,
            paths: options.paths || [],
        };
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

        if (this.state == CREATED) {
            this.state = EXITED;
        } else if (this.state == WAITING) {
            this.container.kill().catch(err => logger.error(err));
            this.state = EXITING;
        }
        // this._checkState();
        debug(`exit done(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }
    
    ensureChild() {
        // All of this is handled for us in prepareForCourse; don't do anything here
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
                this._callCallback(null, data.data, /* this.outputBoth */ '');
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
            outputStdout: this.output,
            stack: errForStack.stack,
            lastCallData: this.lastCallData,
        };
    }
}

module.exports.DockerCaller = DockerCaller;
