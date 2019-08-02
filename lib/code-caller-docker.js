const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const uuidv4 = require('uuid/v4');
const Docker = require('dockerode');
const util = require('util');
const MemoryStream = require('memorystream');

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
    constructor(hooks) {
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

        // start with a null course
        this.course = null;

        this.state = CREATED;
        this._checkState();
        debug(`exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    prepareForCourse(course, callback) {
        if (this.course.path === course.path) {
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

                this.container = await docker.createContainer({
                    Image: workerImage,
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                    HostConfig: {
                        Binds: [
                            '/Users/nathan/.plhostfiles/elements:/elements',
                            '/Users/nathan/.plhostfiles/python:/python',
                            '/Users/nathan/git/PrairieLearn/exampleCourse:/course',
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

                await this.container.start();

                // We don't await this right here; we passively wait for it to exit
                // TODO actually handle this
                this.container.wait().then((data) => console.log(data)).catch((err) => console.error(err));
            } else {
                // We're running on the host
                // TODO bind mounts; can probably reuse some of above code
            }
        })(callback);
    }

    call(file, fcn, args, options, callback) {
    }

    restart() {

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
        // All of this is handled for us in prepareForCourse; don't do anything here
    }
}

/**
 * Used when PrairieLearn is running inside Docker.
 */
class ContainerizedDockerCaller extends DockerCaller {
}

/**
 * Used when PrairieLearn is running natively.
 */
class NativeDockerCaller extends DockerCaller {
}

module.exports.DockerCaller = DockerCaller;
