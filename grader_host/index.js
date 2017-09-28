const ERR = require('async-stacktrace');
const fs = require('fs-extra');
const async = require('async');
const tmp = require('tmp');
const Docker = require('dockerode');
const AWS = require('aws-sdk');
const { exec } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');
const byline = require('byline');

const globalLogger = require('./lib/logger');
const config = require('./lib/config');
const queueReceiver = require('./lib/queueReceiver');
const util = require('./lib/util');


async.series([
    (callback) => {
        config.loadConfig((err) => {
            if (ERR(err, callback)) {
                globalLogger.error('Failed to load config; exiting process');
                process.exit(1);
            }
            callback(null);
        });
    },
    () => {
        globalLogger.info('Initialization complete; beginning to process jobs');
        queueReceiver(config.queueUrl, (message, logger, fail, success) => {
            handleMessage(message, logger, (err) => {
                if (ERR(err, fail)) return;
                success();
            });
        });
    }
]);


function handleMessage(messageBody, logger, done) {
    logger.info(`Grading job ${messageBody.jobId}!`);
    logger.info(messageBody);

    async.auto({
        context: function(callback) {
            logger.info('Creating context for job execution');
            const context = {
                docker: new Docker(),
                s3: new AWS.S3(),
                logger: logger,
                startTime: new Date().toISOString(),
                job: messageBody
            };
            callback(null, context);
        },
        initDocker: ['context', initDocker],
        initFiles: ['context', initFiles],
        runJob: ['initDocker', 'initFiles', runJob],
        uploadResults: ['runJob', uploadResults],
        uploadArchive: ['runJob', uploadArchive],
        cleanup: ['uploadResults', 'uploadArchive', function(results, callback) {
            logger.info('Removing temporary directories');
            results.initFiles.tempDirCleanup();
            callback(null);
        }]
    }, (err) => {
        if (ERR(err, done)) return;
        done(null);
    });
}

function initDocker(info, callback) {
    const {
        context: {
            logger,
            docker,
            job: {
                image
            }
        }
    } = info;

    async.series([
        (callback) => {
            logger.info('Pinging docker');
            docker.ping((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            const repository = util.parseRepositoryTag(image);
            const params = {
                fromImage: repository.repository,
                tag: repository.tag || 'latest'
            };

            docker.createImage(params, (err, stream) => {
                if (err) {
                    logger.warn(`Error pulling "${image}" image; attempting to fall back to cached version`);
                    logger.warn(err);
                }

                docker.modem.followProgress(stream, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                }, (output) => {
                    logger.info(output);
                });
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function initFiles(info, callback) {
    const {
        context: {
            logger,
            s3,
            job: {
                jobId,
                s3JobsBucket,
                entrypoint
            }
        }
    } = info;

    let jobArchiveFile, jobArchiveFileCleanup;
    const files = {};

    async.series([
        (callback) => {
            logger.info('Setting up temp file');
            tmp.file((err, file, fd, cleanup) => {
                if (ERR(err, callback)) return;
                jobArchiveFile = file;
                jobArchiveFileCleanup = cleanup;
                callback(null);
            });
        },
        (callback) => {
            logger.info('Setting up temp dir');
            tmp.dir({
                prefix: `job_${jobId}_`,
                unsafeCleanup: true
            }, (err, dir, cleanup) => {
                if (ERR(err, callback)) return;
                files.tempDir = dir;
                files.tempDirCleanup = cleanup;
                callback(null);
            });
        },
        (callback) => {
            logger.info('Loading job files');
            const params = {
                Bucket: s3JobsBucket,
                Key: `job_${jobId}.tar.gz`
            };
            s3.getObject(params).createReadStream()
            .on('error', (err) => {
                return ERR(err, callback);
            }).on('end', () => {
                callback(null);
            }).pipe(fs.createWriteStream(jobArchiveFile));
        },
        (callback) => {
            logger.info('Unzipping files');
            exec(`tar -xf ${jobArchiveFile} -C ${files.tempDir}`, (err) => {
                if (ERR(err, callback)) return;
                jobArchiveFileCleanup();
                callback(null);
            });
        },
        (callback) => {
            logger.info('Making entrypoint executable');
            exec(`chmod +x ${path.join(files.tempDir, entrypoint.slice(6))}`, (err) => {
                if (err) {
                    logger.error('Could not make file executable; continuing execution anyways');
                }
                callback(null);
            });
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, files);
    });
}

function runJob(info, callback) {
    const {
        context: {
            docker,
            logger,
            startTime,
            job: {
                jobId,
                image,
                entrypoint,
                timeout
            }
        },
        initFiles: {
            tempDir
        }
    } = info;

    let results = {};
    let jobTimeout = timeout || 30;

    logger.info('Launching Docker container to run grading job');

    async.waterfall([
        (callback) => {
            docker.createContainer({
                Image: image,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true,
                HostConfig: {
                    Binds: [
                        `${tempDir}:/grade`
                    ]
                },
                Entrypoint: entrypoint.split(' ')
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
                    logger.info(`container> ${line.toString('utf8')}`);
                });
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
            const timeoutId = setTimeout(() => {
                results.timedOut = true;
                container.kill();
            }, jobTimeout * 1000);
            container.wait((err) => {
                clearTimeout(timeoutId);
                if (ERR(err, callback)) return;
                logger.info('Grading job completed');
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
            logger.info('Reading course results');
            // Now that the job has completed, let's extract the results
            // First up: results.json
            if (results.succeeded) {
                fs.readFile(path.join(tempDir, 'results', 'results.json'), (err, data) => {
                    if (err) {
                        logger.error('Could not read results.json');
                        results.succeeded = false;
                    } else {
                        try {
                            results.results = JSON.parse(data);
                            results.succeeded = true;
                        } catch (e) {
                            logger.error('Could not parse results.json');
                            logger.error(e);
                            results.succeeded = false;
                            results.message = 'Could not parse the grading results.';
                        }
                        callback(null);
                    }
                });
            } else {
                if (results.timedOut) {
                    results.message = `Grading timed out after ${timeout} seconds.`;
                }
                results.results = null;
                callback(null);
            }
        }
    ], (err) => {
        results.job_id = jobId;
        results.start_time = startTime;
        results.end_time = new Date().toISOString();

        if (err) {
            results.end_time = new Date().toISOString();
            results.succeeded = false;
            results.message = err.toString();
            return callback(null, results);
        } else {
            return callback(null, results);
        }
    });
}

function uploadResults(info, callback) {
    const {
        context: {
            logger,
            s3,
            job: {
                jobId,
                s3ResultsBucket,
                webhookUrl,
                csrfToken
            }
        },
        runJob: results
    } = info;

    async.series([
        (callback) => {
            // Now we can send the results back to S3
            logger.info(`Uploading results.json to S3 bucket ${s3ResultsBucket}`);
            const params = {
                Bucket: s3ResultsBucket,
                Key: `job_${jobId}.json`,
                Body: new Buffer(JSON.stringify(results), 'binary')
            };
            s3.putObject(params, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // Let's send the results back to PrairieLearn now; the archive will
            // be uploaded later
            if (webhookUrl) {
                logger.info('Pinging webhook with results');
                const webhookResults = {
                    data: results,
                    event: 'grading_result',
                    job_id: jobId
                };
                fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-csrf-token': csrfToken
                    },
                    body: JSON.stringify(webhookResults)
                }).then(() => callback(null)).catch((err) => {
                    return ERR(err, callback);
                });
            } else {
                callback(null);
            }
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function uploadArchive(results, callback) {
    const {
        context: {
            logger,
            s3,
            job: {
                jobId,
                s3ArchivesBucket
            }
        },
        initFiles: {
            tempDir
        }
    } = results;

    let tempArchive, tempArchiveCleanup;
    async.series([
        // Now we can upload the archive of the /grade directory
        (callback) => {
            logger.info('Creating temp file for archive');
            tmp.file((err, file, fd, cleanup) => {
                if (ERR(err, callback)) return;
                tempArchive = file;
                tempArchiveCleanup = cleanup;
                callback(null);
            });
        },
        (callback) => {
            logger.info('Building archive');
            exec(`tar -zcf ${tempArchive} ${tempDir}`, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            logger.info(`Uploading archive to s3 bucket ${s3ArchivesBucket}`);
            const params = {
                Bucket: s3ArchivesBucket,
                Key: `job_${jobId}.tar.gz`,
                Body: fs.createReadStream(tempArchive)
            };
            s3.upload(params, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        tempArchiveCleanup && tempArchiveCleanup();
        callback(null);
    });
}
