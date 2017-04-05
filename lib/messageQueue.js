var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var config = require('./config');
var csrf = require('./csrf');
var error = require('./error');
var logger = require('./logger');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var AWS = require('aws-sdk');
var targz = require('tar.gz');
var sql = sqlLoader.loadSqlEquiv(__filename);
var fs = require('fs-extra');
var path = require('path');
var os = require('os');
var copydir = require('copy-dir');
var Docker = require('dockerode');

var connected = false;

module.exports = {
};

module.exports.init = function(processGradingResult, callback) {
    if (config.autograderUseAws) {
        // So, this is terrible, but AWS will look relative to the Node working
        // directory, not the current directory. So aws-config.json should be
        // in the project root.
        if (fs.existsSync('./aws-config.json')) {
            logger.info('Loading AWS credentials for autograder')
            AWS.config.loadFromPath('./aws-config.json');
        } else {
            logger.info('Missing \'aws-config.json\' in project root; this should only matter for local development')
            // We need to use the us-east-1 region, since that's the only one where Bathc is available
            AWS.config.update({region: 'us-east-1'});
        }
        callback(null);
    } else {
        // local dev mode
        logger.info('Not loading AWS credentials; autograder running locally')
        module.exports.processGradingResult = processGradingResult;
        callback(null);
    }
};

module.exports.sendToGradingQueue = function(grading_log, submission, variant, question, course, callback) {
    callback(null)
    if (!question.autograding_enabled) {
        // Autograding not specified!
        logger.info('autograding disabled for job id: ' + grading_log.id);

        // Make the grade a automatic 100
        let ret = {
            gradingId: grading_log.id,
            grading: {
                score: 1,
                feedback: {msg: "Autograder is not enabled :("},
            },
        };

        // Send the grade out for processing and display
        module.exports.processGradingResult(ret);
        return;
    }

    // Verify that an image was specified
    if (question.autograder_image === undefined) {
        logger.error('No image was specified for autograded question');
        return;
    }

    // Verify that an environment was specified
    if (question.environment === undefined) {
        // TODO find unique ID for question to print in the error message
        logger.error('No environment was specified for autograded question');
        return;
    }

    console.log('submitting grading job id: ' + grading_log.id);
    logger.info(JSON.stringify(submission.submitted_answer))

    if (config.autograderUseAws) {
        // We should submit our grading job to AWS
        const dir = getGradingDirectoryName(grading_log.id);

        async.series([
            (callback) => {
                buildDirectory(grading_log.id, submission, question, course, callback);
            },
            (callback) => {
                // Now that we've built up our directory, let's zip it up and send
                // it off to S3
                let tarball = new targz({}, {
                    fromBase: true,
                })

                let tarSrc = tarball.createReadStream(dir);

                const params = {
                    Bucket: config.autograderJobsS3Bucket,
                    Key: `job_${grading_log.id}.tar.gz`,
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
                createAndRegisterJobDefinition(grading_log.id, question, (err, data) => {
                    if (ERR(err, callback)) return;
                    logger.info(`Successfully registered job defition for job ${grading_log.id} with AWS Batch`);
                    logger.info(data);
                    callback(null);
                })
            },
            (callback) => {
                submitGradingJobAWS(grading_log.id, question, (err, data) => {
                    if (ERR(err, callback)) return;
                    logger.info(`Successfully submitted grading job ${grading_log.id} to AWS Batch`);
                    logger.info(data);
                    callback(null);
                })
            }
        ], (err) => {
            fs.remove(dir)
            if (err) {
                logger.error(`Error processing autograder job ${grading_log.id}`);
            } else {
                logger.info(`Successfully submitted grading job ${grading_log.id}`);
            }
        });
    } else {
        // local dev mode
        const dir = getGradingDirectoryName(grading_log.id);

        const docker = new Docker();

        async.waterfall([
            (callback) => {
                docker.ping((err, data) => {
                    if (ERR(err, callback)) return;
                    console.log(data)
                    callback(null)
                })
            },
            (callback) => {
                buildDirectory(grading_log.id, submission, question, course, callback);
            },
            (callback) => {
                docker.createContainer({
                    Image: question.autograder_image,
                    AttachStdout: true,
                    AttachStderr: true,
                    HostConfig: {
                        Binds: [
                            `${dir}:/grade`,
                        ],
                    },
                    Env: [
                        'DEV_MODE=1',
                        `JOB_ID=${grading_log.id}`,
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

                    data = JSON.parse(data);

                    // TODO move this to somewhere that can be shared with the webhook
                    const gradingResult = {
                        gradingId: data.job_id,
                        grading: {
                          score: data.results.score,
                          feedback: data.results
                        }
                    }

                    module.exports.processGradingResult(gradingResult);
                })
            },
        ], (err) => {
            fs.remove(dir)
            if (err) {
                logger.error(`Error processing autograder job ${grading_log.id}`);
                logger.error(err)
            } else {
                logger.info(`Successfully submitted grading job ${grading_log.id}`);
            }
        });
    }
};

function getGradingDirectoryName(jobId) {
    const root = (os.platform === 'win32') ? process.cwd().split(path.set)[0] : '/';
    return path.resolve(path.join(root, 'jobs', `job_${jobId}`));
}

function buildDirectory(jobId, submission, question, course, callback) {
    const dir = getGradingDirectoryName(jobId)

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
            const environmentDir = path.join(course.path, 'environments', question.environment);
            copydir(environmentDir, dir, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            if (question.autograder !== undefined) {
                const agDir = path.join(course.path, 'autograders', question.autograder);
                copydir(agDir, path.join(dir, 'shared'), (err) => {
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
                    copydir(testsDir, path.join(dir, 'tests'), (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    })
                } else {
                    logger.warn('No unit tests found for question; maybe you meant to specify some')
                    callback(null);
                }
            })
        },
        (callback) => {
            if (submission.submitted_answer.files) {
                async.each(submission.submitted_answer.files, (file, callback) => {
                    if (!file.name) {
                        return callback(new Error('File was missing \'name\' property.'))
                    }
                    if (!file.contents) {
                        return callback(new Error('File was missing \'contents\' property.'))
                    }
                    fs.writeFile(path.join(dir, 'student', file.name), file.contents, callback);
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
            return logger.error(`Error creating directory for job ${jobId}`);
        }

        logger.info(`Successfully created directory for job ${jobId}`);
        callback(null);
    });
}

function getJobDefinitionName(jobId) {
    return `ag-job-definition-${jobId}`
}

function createAndRegisterJobDefinition(jobId, question, callback) {
    console.log(JSON.stringify(question))
    const params = {
        type: 'container',
        containerProperties: {
            image: question.autograder_image,
            jobRoleArn: config.autograderJobRole,
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
        jobQueue: config.autograderJobQueue,
        containerOverrides: {
            environment: [
                {
                    name: "JOB_ID",
                    value: jobId.toString(),
                },
                {
                    name: "S3_JOBS_BUCKET",
                    value: config.autograderJobsS3Bucket,
                },
                {
                    name: "S3_RESULTS_BUCKET",
                    value: config.autograderResultsS3Bucket,
                },
                {
                    name: "S3_ARCHIVES_BUCKET",
                    value: config.autograderArchivesS3Bucket,
                },
                {
                    name: "WEBHOOK_URL",
                    value: config.autograderWebhookUrl,
                },
                {
                    name: "CSRF_TOKEN",
                    value: csrf.generateToken({url: '/pl/webhooks/autograder'}, config.secretKey),
                },
            ],
        },
    }

    const batch = new AWS.Batch();
    batch.submitJob(params, callback)
}

module.exports.cancelGrading = function(grading_id, callback) {
    // TODO: implement this
    callback(null);
};
