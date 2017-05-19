var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var config = require('./config');
var csrf = require('./csrf');
var error = require('./error');
var logger = require('./logger');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');
var externalGradingSocket = require('./external-grading-socket');

var AWS = require('aws-sdk');
var targz = require('tar.gz');
var sql = sqlLoader.loadSqlEquiv(__filename);
var fs = require('fs-extra');
var path = require('path');
var os = require('os');
var Docker = require('dockerode');

var connected = false;

module.exports = {
};

module.exports.init = function(processGradingResult, callback) {
    module.exports.processGradingResult = processGradingResult;
    if (config.externalGradingUseAws) {
        // So, this is terrible, but AWS will look relative to the Node working
        // directory, not the current directory. So aws-config.json should be
        // in the project root.
        if (fs.existsSync('./aws-config.json')) {
            logger.info('Loading AWS credentials for external grading.')
            AWS.config.loadFromPath('./aws-config.json');
        } else {
            logger.info('Missing \'aws-config.json\' in project root; this should only matter for local development.')
            // We need to use the us-east-1 region, since that's the only one where Bathc is available
            AWS.config.update({region: 'us-east-1'});
        }
        callback(null);
    } else {
        // local dev mode
        logger.info('Not loading AWS credentials; external grader running locally.')
        callback(null);
    }
};

module.exports.sendToGradingQueue = function(grading_job, submission, variant, question, course) {
    if (!question.external_grading_enabled) {
        logger.info('External grading disabled for job id: ' + grading_job.id);

        // Make the grade 0
        let ret = {
            gradingId: grading_job.id,
            grading: {
                score: 0,
                feedback: {
                    succeeded: true,
                    message: "External grading is not enabled :(",
                },
            },
        };

        // Send the grade out for processing and display
        module.exports.processGradingResult(ret);
        return;
    }

    logger.info(`Submitting external grading job ${grading_job.id}.`);

    if (config.externalGradingUseAws) {
        // We should submit our grading job to AWS
        const dir = getJobDirectory(grading_job.id);

        async.series([
            (callback) => {
                buildDirectory(dir, submission, question, course, callback);
            },
            (callback) => {
                // Now that we've built up our directory, let's zip it up and send
                // it off to S3
                let tarball = new targz({}, {
                    fromBase: true,
                })

                let tarSrc = tarball.createReadStream(dir);

                const params = {
                    Bucket: config.externalGradingJobsS3Bucket,
                    Key: `job_${grading_job.id}.tar.gz`,
                }

                let s3Stream = require('s3-upload-stream')(new AWS.S3());
                let upload = s3Stream.upload(params);

                upload.on('error', (err) => {
                    ERR(err, callback);
                })

                upload.on('uploaded', (details) => {
                    logger.info(`Successfully uploaded '${params.Key}' to S3`);
                    callback(null);
                })

                tarSrc.pipe(upload);
            },
            (callback) => {
                createAndRegisterJobDefinition(grading_job.id, question, (err, data) => {
                    if (ERR(err, callback)) return;
                    logger.info(`Successfully registered job defition for job ${grading_job.id} with AWS Batch`);
                    logger.info(data);
                    callback(null);
                })
            },
            (callback) => {
                submitGradingJobAWS(grading_job.id, question, (err, data) => {
                    if (ERR(err, callback)) return;
                    logger.info(`Successfully submitted grading job ${grading_job.id} to AWS Batch`);
                    logger.info(data);
                    callback(null);
                })
            },
            (callback) => {
                updateJobSubmissionTime(grading_job.id, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }
        ], (err) => {
            fs.remove(dir)
            if (err) {
                logger.error(`Error processing grading job ${grading_job.id}`);
                logger.error(err)
            } else {
                logger.info(`Successfully submitted grading job ${grading_job.id}`);
            }
        });
    } else {
        // local dev mode
        const dir = getDevJobDirectory(grading_job.id);
        const hostDir = getDevHostJobDirectory(grading_job.id);

        const docker = new Docker();

        async.waterfall([
            (callback) => {
                docker.ping((err, data) => {
                    if (ERR(err, callback)) return;
                    callback(null)
                })
            },
            (callback) => {
                buildDirectory(dir, submission, question, course, callback);
            },
            (callback) => {
                updateJobSubmissionTime(grading_job.id, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                docker.pull(question.external_grading_image, (err, stream) => {
                    if (ERR(err, callback)) return;

                    docker.modem.followProgress(stream, (err, output) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    }, (output) => {
                        console.log(output);
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
                updateJobSubmissionTime(grading_job.id, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                });
            },
            (container, callback) => {
                container.start((err, data) => {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                })
            },
            (container, callback) => {
                container.wait((err, data) => {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                })
            },
            (container, callback) => {
                container.remove((err, data) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                })
            },
            (callback) => {
                // At this point, we can try to get the results from the job dir
                fs.readFile(path.join(dir, 'results.json'), (err, data) => {
                    if (ERR(err, callback)) return;

                    // Handle the case where JSON is improperly formed
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        const gradingResult = {
                            gradingId: grading_job.id,
                            grading: {
                                score: 0,
                                startTime: null,
                                endTime: null,
                                feedback: {
                                    succeeded: false,
                                },
                            },
                        };

                        return callback(null, gradingResult)
                    }

                    if (!data.succeeded) {
                        const gradingResult = {
                            gradingId: data.job_id,
                            grading: {
                                startTime: data.start_time || null,
                                endTime: data.end_time || null,
                                score: 0,
                                feedback: data
                            }
                        }
                        return callback(null, gradingResult)
                    }

                    if (!data.results) {
                        return callback(new Error('results.json did not contain \'results\' object.'));
                    }

                    if (typeof data.results.score !== 'number' || Number.isNaN(data.results.score)) {
                        return callback(new Error('Score did not exist or is not a number!'));
                    }

                    // TODO move this to somewhere that can be shared with the webhook
                    const gradingResult = {
                        gradingId: data.job_id,
                        grading: {
                            startTime: data.start_time,
                            endTime: data.end_time,
                            score: data.results.score,
                            feedback: data
                        }
                    };

                    return callback(null, gradingResult);
                })
            },
        ], (err, gradingResult) => {
            //fs.remove(dir)
            if (err) {
                logger.error(`Error processing external grading job ${grading_job.id}`);
                logger.error(err);
                gradingResult = {
                    gradingId: grading_job.id,
                    grading: {
                        score: 0,
                        startTime: null,
                        endTime: null,
                        feedback: {
                            succeeded: false,
                        },
                    },
                };
            } else {
                logger.info(`Successfully processed external grading job ${grading_job.id}`);
            }
            module.exports.processGradingResult(gradingResult);
        });
    }
};

/**
 * Returns the directory where job files should be written to while running
 * with AWS infrastructure.
 */
function getJobDirectory(jobId) {
    return `/jobs/job_${jobId}`;
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
            return process.env.JOBS_DIR
        } else {
            return path.resolve(path.join(os.homedir(), 'pl_ag_jobs', `job_${jobId}`));
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

function buildDirectory(dir, submission, question, course, callback) {
    async.series([
        (callback) => {
            // Attempt to remove existing directory first
            fs.remove(dir, (err) => {
                // Ignore error for now
                callback(null)
            })
        },
        (callback) => {
            fs.mkdirs(dir, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            })
        },
        (callback) => {
            fs.mkdir(path.join(dir, 'shared'), (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            })
        },
        (callback) => {
            fs.mkdir(path.join(dir, 'tests'), (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            fs.mkdir(path.join(dir, 'student'), (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            });
        },
        (callback) => {
            // Copy all specified files/directories into shared/
            if (question.external_grading_files) {
                async.each(question.external_grading_files, (file, callback) => {
                    const src = path.join(course.path, 'serverFilesCourse', file);
                    const dest = path.join(dir, 'shared', file);
                    fs.copy(src, dest, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        (callback) => {
            // Tests might not be specified, only copy them if they exist
            const testsDir = path.join(course.path, 'questions', question.directory, 'tests');
            fs.access(testsDir, fs.constants.R_OK, (err) => {
                if (!err) {
                    fs.copy(testsDir, path.join(dir, 'tests'), (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    })
                } else {
                    logger.warn(`No tests directory found for ${question.qid}; maybe you meant to specify some?`)
                    callback(null);
                }
            })
        },
        (callback) => {
            if (submission.submitted_answer._files) {
                async.each(submission.submitted_answer._files, (file, callback) => {
                    if (!file.name) {
                        return callback(new Error('File was missing \'name\' property.'))
                    }
                    if (!file.contents) {
                        return callback(new Error('File was missing \'contents\' property.'))
                    }

                    // Files are expected to be base-64 encoded
                    let decodedContents = new Buffer(file.contents, 'base64').toString();
                    fs.writeFile(path.join(dir, 'student', file.name), decodedContents, callback);
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                })
            } else {
                callback(null);
            }
        },
    ], (err) => {
        if (ERR(err, callback)) {
            return logger.error(`Error setting up ${dir}`);
        }

        logger.info(`Successfully set up ${dir}`);
        callback(null);
    });
}

function getJobDefinitionName(jobId) {
    return `ag-job-definition-${jobId}`
}

function createAndRegisterJobDefinition(jobId, question, callback) {
    const params = {
        type: 'container',
        containerProperties: {
            image: question.external_grading_image,
            jobRoleArn: config.externalGradingJobRole,
            memory: 512,
            vcpus: 1,
        },
        jobDefinitionName: getJobDefinitionName(jobId),
    }

    const batch = new AWS.Batch();
    batch.registerJobDefinition(params, callback)
}

function submitGradingJobAWS(jobId, question, callback) {
    const params = {
        jobDefinition: getJobDefinitionName(jobId),
        jobName: `ag_job_${jobId}`,
        jobQueue: config.externalGradingJobQueue,
        containerOverrides: {
            environment: [
                {
                    name: "JOB_ID",
                    value: jobId.toString(),
                },
                {
                    name: "ENTRYPOINT",
                    value: question.external_grading_entrypoint,
                },
                {
                    name: "S3_JOBS_BUCKET",
                    value: config.externalGradingJobsS3Bucket,
                },
                {
                    name: "S3_RESULTS_BUCKET",
                    value: config.externalGradingResultsS3Bucket,
                },
                {
                    name: "S3_ARCHIVES_BUCKET",
                    value: config.externalGradingArchivesS3Bucket,
                },
                {
                    name: "WEBHOOK_URL",
                    value: config.externalGradingWebhookUrl,
                },
                {
                    name: "CSRF_TOKEN",
                    value: csrf.generateToken({url: '/pl/webhooks/grading'}, config.secretKey),
                },
            ],
        },
    }

    const batch = new AWS.Batch();
    batch.submitJob(params, callback)
}

function updateJobSubmissionTime(grading_job_id, callback) {
    var params = {
        grading_job_id: grading_job_id,
    };
    sqldb.query(sql.update_grading_submitted_time, params, function(err) {
        if (ERR(err, callback)) return;
        externalGradingSocket.gradingLogStatusUpdated(grading_job_id);
        callback(null);
    });
}

module.exports.cancelGrading = function(grading_id, callback) {
    // TODO: implement this
    callback(null);
};
