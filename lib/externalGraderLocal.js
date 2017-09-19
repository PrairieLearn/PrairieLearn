const ERR = require('async-stacktrace');
const async = require('async');
const path = require('path');
const Docker = require('dockerode');
const os = require('os');
const EventEmitter = require('events');
const fs = require('fs-extra');

const logger = require('./logger');
const externalGraderCommon = require('./externalGraderCommon');

class Grader {
    handleGradingRequest(grading_job, submission, variant, question, course) {
        const emitter = new EventEmitter();

        const dir = getDevJobDirectory(grading_job.id);
        const hostDir = getDevHostJobDirectory(grading_job.id);

        const docker = new Docker();

        async.waterfall([
            (callback) => {
                docker.ping((err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                externalGraderCommon.buildDirectory(dir, submission, variant, question, course, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                emitter.emit('submit');
                callback(null);
            },
            (callback) => {
                docker.pull(question.external_grading_image, (err, stream) => {
                    if (err) {
                        logger.warn(`Error pulling "${question.external_grading_image}" image; attempting to fall back to cached version.`);
                        logger.warn(err);
                        return callback(null);
                    }

                    docker.modem.followProgress(stream, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    }, (output) => {
                        logger.info(output);
                    });
                });
            },
            (callback) => {
                docker.createContainer({
                    Image: question.external_grading_image,
                    AttachStdout: true,
                    AttachStderr: true,
                    HostConfig: {
                        Binds: [
                            `${hostDir}:/grade`,
                        ],
                    },
                    Env: [
                        'DEV_MODE=1',
                        `JOB_ID=${grading_job.id}`,
                        `ENTRYPOINT=${question.external_grading_entrypoint}`,
                    ],
                }, (err, container) => {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.attach({
                    stream: true,
                    stdout: true,
                    stderr: true,
                }, (err, stream) => {
                    if (ERR(err, callback)) return;
                    container.modem.demuxStream(stream, process.stdout, process.stderr);
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.start((err) => {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.wait((err) => {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.remove((err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                // At this point, we can try to get the results from the job dir
                fs.readFile(path.join(dir, 'results.json'), (err, data) => {
                    if (ERR(err, callback)) return;

                    return callback(null, externalGraderCommon.makeGradingResult(data));
                });
            },
        ], (err, gradingResult) => {
            if (err) {
                emitter.emit('error', err);
            } else {
                emitter.emit('results', gradingResult);
            }
        });

        return emitter;
    }
}

/**
 * Returns the path to the directory where the grading job files should be
 * written to while running in development (local) mode.
 *
 * If we're running natively, this should return $HOME/.pl_ag_jobs/job_<jobId>.
 * If we're running in Docker, this should return /jobs.
 *
 * On Windows, we use $USERPROFILE instead of $HOME.
 */
function getDevJobDirectory(jobId) {
    if (process.env.HOST_JOBS_DIR) {
        // We're probably running in Docker
        return path.join('/jobs', `job_${jobId}`);
    } else {
        // We're probably running natively
        if (process.env.JOBS_DIR) {
            // The user wants to use a custom jobs dir
            return process.env.JOBS_DIR;
        } else {
            return path.resolve(path.join(os.homedir(), '.pljobs', `job_${jobId}`));
        }
    }
}

/**
 * Returns the directory that should be mounted to the grading container as
 * /grade while running in development (local) mode.
 *
 * If we're running natively, this should simply return getDevJobDirectory(...).
 * If we're running in Docker, this should return $HOST_JOBS_DIR/job_<jobId>.
 */
function getDevHostJobDirectory(jobId) {
    if (process.env.HOST_JOBS_DIR) {
        // We're probably running in Docker
        return path.resolve(path.join(process.env.HOST_JOBS_DIR, `job_${jobId}`));
    } else {
        // We're probably running natively
        return getDevJobDirectory(jobId);
    }
}

module.exports = Grader;
