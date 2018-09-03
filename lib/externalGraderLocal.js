const ERR = require('async-stacktrace');
const async = require('async');
const path = require('path');
const Docker = require('dockerode');
const os = require('os');
const EventEmitter = require('events');
const fs = require('fs-extra');
const { exec } = require('child_process');
const byline = require('byline');

const logger = require('./logger');
const externalGraderCommon = require('./externalGraderCommon');
const config = require('./config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

class Grader {
    handleGradingRequest(grading_job, submission, variant, question, course) {
        const emitter = new EventEmitter();

        const results = {};

        const dir = getDevJobDirectory(grading_job.id);
        const hostDir = getDevHostJobDirectory(grading_job.id);
        const timeout = question.external_grading_timeout || config.externalGradingDefaultTimeout;

        const docker = new Docker();

        // Delay until emitter has been returned and listener attached.
        setTimeout(() => {
            emitter.emit('submit');
        }, 0);

        let output = '';
        async.waterfall([
            (callback) => {
                docker.ping((err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                results.received_time = new Date().toISOString();
                emitter.emit('received', results.received_time);
                callback(null);
            },
            (callback) => {
                externalGraderCommon.buildDirectory(dir, submission, variant, question, course, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                exec(`chmod +x ${path.join(dir, question.external_grading_entrypoint.slice(6))}`, (err) => {
                    if (err) {
                        logger.error('Could not make file executable; continuing execution anyways');
                    }
                    callback(null);
                });
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
                    Tty: true,
                    NetworkDisabled: !question.external_grading_enable_networking,
                    HostConfig: {
                        Binds: [
                            `${hostDir}:/grade`,
                        ],
                        Memory: 1 << 30, // 1 GiB
                        MemorySwap: 1 << 30, // same as Memory, so no access to swap
                        KernelMemory: 1 << 29, // 512 MiB
                        DiskQuota: 1 << 30, // 1 GiB
                        IpcMode: 'private',
                        CpuPeriod: 100000, // microseconds
                        CpuQuota: 90000, // portion of the CpuPeriod for this container
                        PidsLimit: 1024,
                    },
                    Entrypoint: question.external_grading_entrypoint.split(' '),
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
                    const out = byline(stream);
                    out.on('data', (line) => {
                        const newline = `container> ${line.toString('utf8')}`;
                        logger.info(newline);
                        output += (newline + '\n');
                    });
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.start((err) => {
                    if (ERR(err, callback)) return;

                    results.start_time = new Date().toISOString();
                    callback(null, container);
                });
            },
            (container, callback) => {
                const timeoutId = setTimeout(() => {
                    logger.info('Timeout exceeded; killing container');
                    container.kill();
                    results.timedOut = true;
                }, timeout * 1000);
                container.wait((err) => {
                    clearTimeout(timeoutId);
                    if (ERR(err, callback)) return;
                    results.end_time = new Date().toISOString();
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.inspect((err, data) => {
                    if (ERR(err, callback)) return;
                    results.succeeded = (!results.timedOut && data.State.ExitCode == 0);
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
                // Save job output
                const outputParams = {
                    grading_job_id: grading_job.id,
                    output,
                };
                sqldb.query(sql.update_job_output, outputParams, (err, _result) => {
                    if (ERR(err, (err) => logger.error(err))) return;
                    callback(null);
                });
            },
            (callback) => {
                logger.info('Constructing results object');
                results.job_id = grading_job.id;
                // Now that the job has completed, let's extract the results
                // First up: results.json
                if (results.succeeded) {
                    fs.readFile(path.join(dir, 'results', 'results.json'), (err, data) => {
                        if (err) {
                            logger.error('Could not read results.json');
                            results.succeeded = false;
                        } else {
                            if (Buffer.byteLength(data) > 1024 * 1024) {
                                // Cap output at 1MB
                                results.succeeded = false;
                                results.message = 'The grading results were larger than 1MB. ' +
                                'If the problem persists, please contact course staff or a proctor.';
                            } else {
                                try {
                                    logger.info('parsing!');
                                    results.results = JSON.parse(data);
                                    results.succeeded = true;
                                } catch (e) {
                                    logger.error('Could not parse results.json');
                                    logger.error(e);
                                    results.succeeded = false;
                                    results.message = 'Could not parse the grading results.';
                                }
                            }
                        }
                        return callback(null, externalGraderCommon.makeGradingResult(grading_job.id, results));
                    });
                } else {
                    results.results = null;

                    if (results.timedOut) {
                        results.message = `Grading timed out after ${timeout} seconds.`;
                    }

                    return callback(null, externalGraderCommon.makeGradingResult(grading_job.id, results));
                }
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
